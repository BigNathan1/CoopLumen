import { Request, Response, Router } from 'express';
import { buildUnsignedTrustline } from '../../contracts/trustlines';
import { buildTrustlineSchema } from '../schemas/trustline';
import { mapHorizonError } from '../utils/horizonError';

export const trustlineRouter = Router();

/** Build a changeTrust transaction for signing by the account's wallet. */
trustlineRouter.post('/build', async (req: Request, res: Response): Promise<void> => {
  const parsed = buildTrustlineSchema.safeParse(req.body);

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
    const xdr = await buildUnsignedTrustline(parsed.data);
    res.status(200).json({ data: { xdr } });
  } catch (error) {
    const mapped = mapHorizonError(error);
    res.status(mapped.status).json({ data: null, error: mapped.message });
  }
});
