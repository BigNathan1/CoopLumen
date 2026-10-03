import { Request, Response, Router } from 'express';
import { BASE_FEE } from '@stellar/stellar-sdk';
import { buildBatchPayment, submitBatchPayment } from '../../contracts/batchPayments';
import {
  batchDisburseSchema,
  batchPreviewSchema,
  parseCsvSchema,
  BatchPaymentEntryInput,
} from '../schemas/batch';
import { isValidStellarPublicKey } from '../utils/stellar';
import { mapHorizonError } from '../utils/horizonError';

export const batchRouter = Router();

/**
 * POST /api/v1/batch/disburse
 *
 * Executes a batch payment carrying multiple Payment operations in one atomic transaction.
 *
 * Request body:
 *   - senderSecret {string} required - Secret seed for the sender keypair
 *   - payments     {array}  required - 1-100 payment entries ({ destinationPublicKey, amount, assetCode, assetIssuer })
 *   - memo         {string} optional - Text memo (max 28 bytes)
 *
 * @route POST /api/v1/batch/disburse
 */
batchRouter.post('/disburse', async (req: Request, res: Response): Promise<void> => {
  const parsed = batchDisburseSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      data: null,
      meta: {
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      error: 'Validation failed',
    });
    return;
  }

  const { senderSecret, payments, memo } = parsed.data;

  try {
    const hash = await submitBatchPayment({
      senderSecret,
      payments: payments.map((p) => ({
        destinationPublicKey: p.destinationPublicKey,
        amount: p.amount,
        assetCode: p.assetCode,
        assetIssuer: p.assetIssuer ?? '',
      })),
      memo,
    });

    const totalAmount = payments
      .reduce((sum, p) => sum + Number(p.amount), 0)
      .toFixed(7)
      .replace(/\.?0+$/, '');

    res.status(200).json({
      data: {
        hash,
        paymentsCount: payments.length,
        totalAmount,
        memo: memo ?? null,
      },
    });
  } catch (error) {
    const mapped = mapHorizonError(error);
    res.status(mapped.status).json({
      data: null,
      error: mapped.message,
    });
  }
});

/**
 * POST /api/v1/batch/preview
 *
 * Previews a batch payment before signing. Calculates fee estimations, total amounts
 * per asset, recipient counts, and builds the unsigned XDR.
 *
 * Request body:
 *   - senderPublicKey {string} required - Sender public key
 *   - payments        {array}  required - 1-100 payment entries
 *   - memo            {string} optional - Text memo
 *
 * @route POST /api/v1/batch/preview
 */
batchRouter.post('/preview', async (req: Request, res: Response): Promise<void> => {
  const parsed = batchPreviewSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      data: null,
      meta: {
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      error: 'Validation failed',
    });
    return;
  }

  const { senderPublicKey, payments, memo } = parsed.data;

  try {
    const xdr = await buildBatchPayment({
      senderPublicKey,
      payments: payments.map((p) => ({
        destinationPublicKey: p.destinationPublicKey,
        amount: p.amount,
        assetCode: p.assetCode,
        assetIssuer: p.assetIssuer ?? '',
      })),
      memo,
    });

    // Calculate sum per asset
    const totalAmounts: Record<string, string> = {};
    for (const p of payments) {
      const key = p.assetCode === 'XLM' ? 'XLM' : `${p.assetCode}:${p.assetIssuer}`;
      const current = Number(totalAmounts[key] || '0');
      const updated = current + Number(p.amount);
      totalAmounts[key] = updated.toFixed(7).replace(/\.?0+$/, '');
    }

    const estimatedFeeStroops = Number(BASE_FEE) * payments.length;

    res.status(200).json({
      data: {
        recipientCount: payments.length,
        totalAmounts,
        estimatedFeeStroops,
        xdr,
        payments,
      },
    });
  } catch (error) {
    const mapped = mapHorizonError(error);
    res.status(mapped.status).json({
      data: null,
      error: mapped.message,
    });
  }
});

/**
 * POST /api/v1/batch/parse-csv
 *
 * Parses CSV input in `address,amount` format for batch disbursement.
 *
 * Request body:
 *   - csv                {string} required - CSV text data
 *   - defaultAssetCode   {string} optional - Default asset code (default: XLM)
 *   - defaultAssetIssuer {string} optional - Default asset issuer
 *
 * @route POST /api/v1/batch/parse-csv
 */
batchRouter.post('/parse-csv', (req: Request, res: Response): void => {
  const parsed = parseCsvSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      data: null,
      meta: {
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      error: 'Validation failed',
    });
    return;
  }

  const { csv, defaultAssetCode, defaultAssetIssuer } = parsed.data;
  const lines = csv.split(/\r?\n/);
  const entries: BatchPaymentEntryInput[] = [];
  const lineErrors: Array<{ line: number; message: string }> = [];

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();

    // Skip empty lines and comment lines
    if (!line || line.startsWith('#')) {
      return;
    }

    // Skip header line if present
    const lower = line.toLowerCase();
    if (
      lower.startsWith('address') ||
      lower.startsWith('destination') ||
      lower.startsWith('recipient')
    ) {
      return;
    }

    const parts = line.split(',').map((p) => p.trim());
    const dest = parts[0];
    const amt = parts[1];
    const code = parts[2] || defaultAssetCode;
    const issuer = (parts[3] || defaultAssetIssuer) ?? '';

    if (!dest || !isValidStellarPublicKey(dest)) {
      lineErrors.push({
        line: lineNumber,
        message: `Line ${lineNumber}: Invalid destination Stellar public key "${dest || ''}"`,
      });
      return;
    }

    if (!amt || !/^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/.test(amt) || Number(amt) <= 0) {
      lineErrors.push({
        line: lineNumber,
        message: `Line ${lineNumber}: Amount must be a positive decimal string (got "${amt || ''}")`,
      });
      return;
    }

    if (code !== 'XLM' && !issuer) {
      lineErrors.push({
        line: lineNumber,
        message: `Line ${lineNumber}: Asset issuer is required for non-XLM asset "${code}"`,
      });
      return;
    }

    if (issuer && !isValidStellarPublicKey(issuer)) {
      lineErrors.push({
        line: lineNumber,
        message: `Line ${lineNumber}: Invalid asset issuer public key "${issuer}"`,
      });
      return;
    }

    entries.push({
      destinationPublicKey: dest,
      amount: amt,
      assetCode: code,
      assetIssuer: issuer || undefined,
    });
  });

  if (entries.length === 0 && lineErrors.length === 0) {
    res.status(400).json({
      data: null,
      error: 'CSV validation failed',
      meta: {
        errors: [{ path: 'csv', message: 'No valid payment entries found in CSV' }],
      },
    });
    return;
  }

  if (lineErrors.length > 0) {
    res.status(400).json({
      data: null,
      error: 'CSV validation failed',
      meta: {
        errors: lineErrors.map((e) => ({
          path: `line ${e.line}`,
          message: e.message,
        })),
      },
    });
    return;
  }

  res.status(200).json({
    data: {
      entries,
      validCount: entries.length,
    },
  });
});
