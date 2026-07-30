import { Router, Request, Response } from 'express';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import { z } from 'zod';
import { StellarService } from '../../contracts/stellar';
import { invalidateBalanceCache } from '../../cache/balances';
import { mapHorizonError } from '../utils/horizonError';
import {
  getNativeBalance,
  getRequiredXlmForTransaction,
  getTransactionDestination,
  getTransactionSource,
} from '../utils/stellarTransaction';

const router = Router();

const transferSchema = z.object({
  signedXdr: z.string().trim().min(1, 'signedXdr is required').max(100_000),
});

function validationErrors(error: z.ZodError): unknown[] {
  return error.issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
  }));
}

router.post('/transfer', async (req: Request, res: Response): Promise<void> => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      data: null,
      meta: { errors: validationErrors(parsed.error) },
      error: 'Invalid request body',
    });
    return;
  }

  let transaction: ReturnType<typeof TransactionBuilder.fromXDR>;
  try {
    transaction = TransactionBuilder.fromXDR(parsed.data.signedXdr, StellarService.getNetwork());
  } catch {
    res.status(400).json({
      data: null,
      error: 'The signedXdr is not a valid transaction for the configured Stellar network.',
    });
    return;
  }

  if (transaction.operations.length !== 1 || transaction.operations[0]?.type !== 'payment') {
    res.status(400).json({
      data: null,
      error: 'The signed transaction must contain exactly one payment operation.',
    });
    return;
  }

  try {
    const result = await StellarService.submitTransaction(transaction);
    await invalidateBalanceCache([
      getTransactionSource(transaction),
      getTransactionDestination(transaction),
    ]);
    res.status(200).json({ data: { txHash: result.hash } });
  } catch (error) {
    const sourcePublicKey = getTransactionSource(transaction);
    const account =
      sourcePublicKey !== undefined
        ? await StellarService.loadAccount(sourcePublicKey).catch(() => null)
        : null;
    const mapped = mapHorizonError(error, {
      requiredXlm: getRequiredXlmForTransaction(transaction),
      currentBalance: account ? getNativeBalance(account) : undefined,
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

    res.status(mapped.status).json({
      data: null,
      error: mapped.message,
    });
  }
});

export { router as tokenTransferRouter };
export default router;
