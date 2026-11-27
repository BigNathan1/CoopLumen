import { NextFunction, Request, Response, Router } from 'express';
import { db } from '../../db';
import { validateParams, validateQuery } from '../middleware/validate';
import { analyticsParamsSchema, analyticsQuerySchema } from '../schemas/analytics';

interface LoanSummaryRow {
  total_loans: number;
  active_loans: number;
  repaid_loans: number;
  defaulted_loans: number;
  total_disbursed: string;
  total_repaid: string;
  total_outstanding: string;
}

export const analyticsRouter: Router = Router();

/**
 * GET /api/v1/analytics/:communityId
 * Loan totals for a community, optionally limited to one asset. Outstanding is
 * principal plus flat interest minus repayments on active loans, the same
 * figure the loan endpoints report; the repayment rate is repaid loans over
 * closed (repaid or defaulted) loans, or null when none have closed.
 */
analyticsRouter.get(
  '/:communityId',
  validateParams(analyticsParamsSchema),
  validateQuery(analyticsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { communityId } = req.params as { communityId: string };
      const assetCode = typeof req.query.assetCode === 'string' ? req.query.assetCode : undefined;

      const values: unknown[] = [communityId];
      const assetFilter = assetCode ? `AND asset_code = $${values.push(assetCode)}` : '';

      const [row] = await db.query<LoanSummaryRow>(
        `SELECT
           COUNT(*)::int AS total_loans,
           COUNT(*) FILTER (WHERE status = 'active')::int AS active_loans,
           COUNT(*) FILTER (WHERE status = 'repaid')::int AS repaid_loans,
           COUNT(*) FILTER (WHERE status = 'defaulted')::int AS defaulted_loans,
           COALESCE(SUM(amount), 0)::text AS total_disbursed,
           COALESCE(SUM(amount_repaid), 0)::text AS total_repaid,
           COALESCE(SUM(GREATEST(amount * (1 + COALESCE(interest_rate, 0) / 100) - amount_repaid, 0))
             FILTER (WHERE status = 'active'), 0)::text AS total_outstanding
         FROM loans
         WHERE community_id = $1 ${assetFilter}`,
        values
      );

      const closed = row.repaid_loans + row.defaulted_loans;
      res.json({
        data: {
          community_id: communityId,
          asset_code: assetCode ?? null,
          ...row,
          repayment_rate: closed > 0 ? Number((row.repaid_loans / closed).toFixed(4)) : null,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
