import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Asset, Keypair, Operation, TransactionBuilder, BASE_FEE } from '@stellar/stellar-sdk';
import { db } from '../../db';
import { StellarService } from '../../contracts/stellar';

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

function horizonMessage(error: unknown): string {
  const candidate = error as {
    response?: {
      data?: {
        extras?: {
          result_codes?: {
            transaction?: string;
            operations?: string[];
          };
        };
      };
    };
    message?: string;
  };

  const transactionCode = candidate.response?.data?.extras?.result_codes?.transaction;
  const operationCode = candidate.response?.data?.extras?.result_codes?.operations?.find(Boolean);
  const code = transactionCode ?? operationCode;

  const messages: Record<string, string> = {
    tx_bad_auth: 'The issuer secret cannot authorize this transaction.',
    tx_bad_seq: 'The issuer account sequence is stale; please retry the airdrop.',
    tx_insufficient_balance:
      'The issuer account does not have enough funds to pay transaction fees.',
    op_no_trust: 'One or more recipients have not established a trustline for this token.',
    op_underfunded: 'The issuer account does not have enough token balance for the airdrop.',
    op_line_full: 'One or more recipients would exceed their trustline limit.',
    op_no_issuer: 'The configured token issuer account does not exist on the Stellar network.',
    op_malformed: 'The Stellar payment was rejected because its parameters are invalid.',
  };

  return code && messages[code]
    ? messages[code]
    : 'The Stellar network rejected the airdrop. Verify the issuer account, trustlines, and balance.';
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

    const server = StellarService.getServer();
    const network = StellarService.getNetwork();
    const asset = new Asset(community.asset_code, community.asset_issuer);
    const txHashes: string[] = [];

    for (const member of members) {
      const account = await server.loadAccount(issuer.publicKey());
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
      const result = await server.submitTransaction(transaction);
      txHashes.push(result.hash);
    }

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

    res.status(502).json({ data: null, error: horizonMessage(error) });
  }
});

export default router;
