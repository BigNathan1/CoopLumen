import { Router, Request, Response } from 'express';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import { z } from 'zod';
import { StellarService } from '../../contracts/stellar';

const router = Router();

const transferSchema = z.object({
  signedXdr: z.string().trim().min(1, 'signedXdr is required').max(100_000),
});

interface HorizonFailure {
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
}

const STELLAR_ERRORS: Record<string, string> = {
  tx_bad_auth: 'The transaction signature is invalid or incomplete.',
  tx_bad_seq: 'The transaction sequence number is stale. Please build and sign a new transaction.',
  tx_expired: 'The transaction has expired. Please build and sign a new transaction.',
  tx_insufficient_fee: 'The transaction fee is too low for the network.',
  tx_insufficient_balance:
    'The payment account does not have enough XLM to cover the payment and fee.',
  tx_failed: 'The transaction was rejected by the Stellar network.',
  tx_bad_auth_extra: 'The transaction contains an invalid extra signature.',
  op_underfunded: 'The payment account does not have enough balance for this payment.',
  op_no_destination: 'The payment destination account does not exist.',
  op_no_trust: 'The destination account has no trustline for this asset.',
  op_not_authorized: 'The destination account is not authorized to receive this asset.',
  op_line_full: 'The destination trustline cannot hold the requested amount.',
  op_under_dest_min: 'The payment amount is below the destination minimum.',
  op_src_no_trust: 'The source account has no trustline for this asset.',
  op_src_not_authorized: 'The source account is not authorized to send this asset.',
  op_malformed: 'The payment operation is malformed.',
};

function validationErrors(error: z.ZodError): unknown[] {
  return error.issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
  }));
}

function horizonMessage(error: HorizonFailure): string {
  const resultCodes = error.response?.data?.extras?.result_codes;
  const operationCode = resultCodes?.operations?.find((code) => Boolean(code));
  const code = operationCode ?? resultCodes?.transaction;

  if (code && STELLAR_ERRORS[code]) return STELLAR_ERRORS[code];
  if (code)
    return `The Stellar transaction was rejected (${code}). Please review the payment and try again.`;
  return 'Horizon could not submit the payment transaction. Please verify the signed XDR and try again.';
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
    const result = await StellarService.getServer().submitTransaction(transaction);
    res.status(200).json({ data: { txHash: result.hash } });
  } catch (error) {
    res.status(422).json({
      data: null,
      error: horizonMessage(error as HorizonFailure),
    });
  }
});

export { router as tokenTransferRouter };
export default router;
