import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db'; // Adjust to your repo's db/pool import

const router = Router();

const paramsSchema = z.object({
  communityId: z.string().uuid('communityId must be a valid UUID'),
});

const querySchema = z.object({
  assetCode: z.string().min(1).max(12).optional(),
});

router.get('/:communityId', async (req: Request, res: Response) => {
  const parsedParams = paramsSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return res.status(400).json({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid communityId parameter',
        details: parsedParams.error.flatten(),
      },
    });
  }

  const parsedQuery = querySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: parsedQuery.error.flatten(),
      },
    });
  }

  const { communityId } = parsedParams.data;
  const { assetCode } = parsedQuery.data;

  try {
    const values: unknown[] = [communityId];
    const assetFilter = assetCode ? `AND asset_code = $2` : '';
    if (assetCode) values.push(assetCode);

    const summaryResult = await db.query(
      `
      SELECT
        COUNT(*)::int AS total_loans,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_loans,
        COUNT(*) FILTER (WHERE status = 'repaid')::int AS repaid_loans,
        COUNT(*) FILTER (WHERE status = 'defaulted')::int AS defaulted_loans,
        COALESCE(SUM(amount), 0)::text AS total_disbursed,
        COALESCE(SUM(amount_repaid), 0)::text AS total_repaid,
        COALESCE(SUM(GREATEST(total_due - amount_repaid, 0)) FILTER (WHERE status = 'active'), 0)::text AS total_outstanding
      FROM loans
      WHERE community_id = $1 ${assetFilter}
      `,
      values,
    );

    const row = summaryResult.rows[0];
    const closedCount = (row.repaid_loans ?? 0) + (row.defaulted_loans ?? 0);
    const repaymentRate = closedCount > 0 ? Number((row.repaid_loans / closedCount).toFixed(4)) : null;

    return res.status(200).json({
      data: {
        community_id: communityId,
        asset_code: assetCode ?? null,
        total_loans: row.total_loans,
        active_loans: row.active_loans,
        repaid_loans: row.repaid_loans,
        defaulted_loans: row.defaulted_loans,
        total_disbursed: row.total_disbursed,
        total_repaid: row.total_repaid,
        total_outstanding: row.total_outstanding,
        repayment_rate: repaymentRate,
      },
    });
  } catch (err) {
    return res.status(500).json({
      data: null,
      error: {
        code: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Failed to compute loan analytics',
      },
    });
  }
});

export default router;