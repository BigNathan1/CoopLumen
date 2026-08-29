import { Request, Response, Router } from 'express';
import { buildUnsignedPayment } from '../../contracts/transactions';
import { unsignedPaymentSchema } from '../schemas/transaction';
import { mapHorizonError } from '../utils/horizonError';

export const transactionRouter = Router();

/**
 * POST /api/v1/transactions/unsigned
 *
 * Builds an unsigned Stellar payment transaction XDR for signing by the source account's wallet.
 *
 * Loads the source account and its current sequence number from Horizon, then constructs a
 * single-operation payment transaction. The transaction is NOT signed or submitted by this
 * endpoint — the caller's wallet must sign the returned XDR and then POST the signed
 * transaction to POST /api/v1/tokens/transfer.
 *
 * Request body fields (UnsignedPaymentRequest):
 *   - senderPublicKey       {string} required  - Source account Stellar public key
 *   - destinationPublicKey  {string} required  - Destination account Stellar public key
 *   - assetCode             {string} required  - Asset code (use "XLM" for native)
 *   - amount                {string} required  - Positive decimal amount (up to 7 decimal places)
 *   - assetIssuer           {string} optional  - Issuer public key; required for non-XLM assets
 *   - memo                  {string} optional  - Text memo, at most 28 UTF-8 bytes
 *
 * @route   POST /api/v1/transactions/unsigned
 * @returns {200} { data: { xdr: string } } - Base64-encoded unsigned transaction envelope XDR
 * @returns {400} ValidationErrorResponse   - Request body failed Zod validation
 * @returns {404} ErrorResponse             - Source account does not exist on the configured network
 * @returns {502} ErrorResponse             - Horizon is temporarily unavailable
 * @see     POST /api/v1/tokens/transfer to submit the signed transaction
 * @see     {@link https://developers.stellar.org/docs/learn/fundamentals/transactions} Stellar transactions
 */
transactionRouter.post('/unsigned', async (req: Request, res: Response): Promise<void> => {
  const parsed = unsignedPaymentSchema.safeParse(req.body);

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

  try {
    const xdr = await buildUnsignedPayment({
      ...parsed.data,
      assetIssuer: parsed.data.assetIssuer ?? '',
    });

    res.status(200).json({ data: { xdr } });
  } catch (error) {
    const mapped = mapHorizonError(error);
    res.status(mapped.status).json({ data: null, error: mapped.message });
  }
});
