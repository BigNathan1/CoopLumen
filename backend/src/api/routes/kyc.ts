import { NextFunction, Request, Response, Router } from 'express';
import { db } from '../../db';
import { validateParams } from '../middleware/validate';
import { kycStatusParamsSchema } from '../schemas/kyc';

export const kycRouter = Router();

type StoredKycStatus = 'pending' | 'submitted' | 'verified' | 'rejected' | 'expired';
type PublicKycStatus = 'none' | 'pending' | 'approved' | 'rejected';

function toPublicStatus(status: StoredKycStatus | undefined): PublicKycStatus {
  if (!status) return 'none';
  if (status === 'verified') return 'approved';
  if (status === 'pending' || status === 'submitted') return 'pending';
  return 'rejected';
}

/** Returns the latest KYC outcome recorded for a Stellar account. */
kycRouter.get(
  '/status/:address',
  validateParams(kycStatusParamsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [record] = await db.query<{ status: StoredKycStatus }>(
        `SELECT status
           FROM kyc_records
          WHERE stellar_address = $1
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 1`,
        [req.params.address]
      );

      res.json({
        data: {
          address: req.params.address,
          status: toPublicStatus(record?.status),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);
