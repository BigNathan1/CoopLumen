import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Asset, Keypair, Operation, TransactionBuilder, BASE_FEE } from '@stellar/stellar-sdk';
import { db } from '../../db';
import { StellarService } from '../../contracts/stellar';
import { invalidateBalanceCache } from '../../cache/balances';
import { mapHorizonError } from '../utils/horizonError';
import { getNativeBalance, getRequiredXlmForFee } from '../utils/stellarTransaction';

const router = Router();

const airdropSchema = z.object({
  communityId: z.string().uuid(),
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,7})?$/, 'amount must be a positive decimal with up to 7 places')
    .refine((value) => Number(value) > 0, 'amount must be greater than zero'),
  issuerSecret: z.string().trim().min(1, 'issuerSecret is required'),
});

interface CommunityRow {
  asset_code: string;
  asset_issuer: string;
}

interface MemberRow {
  stellar_address: string;
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = airdropSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      data: null,
      error: 'Invalid request body',
      meta: { errors: parsed.error.flatten().fieldErrors },
    });
    return;
  }

  let currentBalance: string | undefined;

  try {
    const { communityId, amount, issuerSecret } = parsed.data;
    const communities = await db.query<CommunityRow>(
      `SELECT asset_code, asset_issuer
       FROM communities
       WHERE id = $1 AND deleted_at IS NULL`,
      [communityId]
    );

    if (communities.length === 0) {
      res.status(404).json({ data: null, error: 'Community not found' });
      return;
    }

    const members = await db.query<MemberRow>(
      `SELECT stellar_address
       FROM members
       WHERE community_id = $1`,
      [communityId]
    );

    if (members.length === 0) {
      res
        .status(400)
        .json({ data: null, error: 'Community has no members to receive the airdrop' });
      return;
    }

    let issuer: Keypair;
    try {
      issuer = Keypair.fromSecret(issuerSecret);
    } catch {
      res.status(400).json({ data: null, error: 'issuerSecret is not a valid Stellar secret key' });
      return;
    }

    const community = communities[0];
    if (issuer.publicKey() !== community.asset_issuer) {
      res.status(400).json({
        data: null,
        error: 'issuerSecret does not belong to the community token issuer',
      });
      return;
    }

    const network = StellarService.getNetwork();
    const asset = new Asset(community.asset_code, community.asset_issuer);
    const txHashes: string[] = [];

    for (const member of members) {
      const account = await StellarService.loadAccount(issuer.publicKey());
      currentBalance = getNativeBalance(account);
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: network,
      })
        .addOperation(
          Operation.payment({
            destination: member.stellar_address,
            asset,
            amount,
          })
        )
        .setTimeout(30)
        .build();

      transaction.sign(issuer);
      const result = await StellarService.submitTransaction(transaction);
      txHashes.push(result.hash);
    }

    await invalidateBalanceCache([
      issuer.publicKey(),
      ...members.map((member) => member.stellar_address),
    ]);

    res.status(200).json({
      data: {
        amount,
        recipientCount: members.length,
        txHashes,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Invalid Stellar')) {
      res.status(400).json({ data: null, error: error.message });
      return;
    }

    const mapped = mapHorizonError(error, {
      requiredXlm: getRequiredXlmForFee(BASE_FEE),
      currentBalance,
    });

    if (mapped.code === 'INSUFFICIENT_BALANCE') {
      res.status(mapped.status).json({
        data: null,
        error: {
          code: mapped.code,
          message: mapped.message,
          requiredXlm: mapped.requiredXlm,
          currentBalance: mapped.currentBalance,
        },
      });
      return;
    }

    res.status(mapped.status).json({ data: null, error: mapped.message });
  }
});

export default router;
