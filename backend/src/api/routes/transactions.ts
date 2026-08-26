import { Request, Response, Router } from 'express';
import { buildUnsignedPayment } from '../../contracts/transactions';
import { unsignedPaymentSchema } from '../schemas/transaction';
import { mapHorizonError } from '../utils/horizonError';

export const transactionRouter = Router();

/** Build a payment transaction for signing by the source account's wallet. */
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
