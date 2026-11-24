import { db } from '../db';
import { PoolClient } from 'pg';

export interface DefaultedLoanResult {
  id: string;
  community_id: string;
  borrower_address: string;
  lender_address: string;
  amount: string;
  due_at: string;
}

/**
 * Upserts a borrower's reputation row and recomputes their score.
 */
async function bumpReputation(
  client: PoolClient,
  communityId: string,
  address: string,
  field: 'total_loans' | 'on_time_repayments' | 'defaults'
): Promise<void> {
  const {
    rows: [row],
  } = await client.query<{ on_time_repayments: number; defaults: number }>(
    `INSERT INTO reputation_scores (stellar_address, community_id, ${field})
     VALUES ($1, $2, 1)
     ON CONFLICT (stellar_address, community_id)
     DO UPDATE SET ${field} = reputation_scores.${field} + 1
     RETURNING on_time_repayments, defaults`,
    [address, communityId]
  );

  const onTime = Number(row?.on_time_repayments ?? 0);
  const defaults = Number(row?.defaults ?? 0);
  const score = Math.round(((100 * (onTime + 1)) / (onTime + defaults + 2)) * 100) / 100;

  await client.query(
    `UPDATE reputation_scores
     SET score = $1, last_calculated_at = NOW()
     WHERE stellar_address = $2 AND community_id = $3`,
    [score, address, communityId]
  );
}

/**
 * Scans active loans past their due_at date, transitions them to defaulted,
 * logs events and audit trails, and updates borrower reputation scores.
 */
export async function detectLoanDefaults(): Promise<DefaultedLoanResult[]> {
  const overdueLoans = await db.query<DefaultedLoanResult>(
    `SELECT id, community_id, borrower_address, lender_address, amount, due_at
     FROM loans
     WHERE status = 'active'
       AND due_at IS NOT NULL
       AND due_at < NOW()`
  );

  if (overdueLoans.length === 0) {
    return [];
  }

  const processed: DefaultedLoanResult[] = [];

  for (const loan of overdueLoans) {
    const defaulted = await db.transaction(async (client) => {
      const { rows } = await client.query<DefaultedLoanResult>(
        `SELECT id, community_id, borrower_address, lender_address, amount, due_at
         FROM loans
         WHERE id = $1 AND status = 'active'
         FOR UPDATE`,
        [loan.id]
      );

      if (rows.length === 0) {
        return null;
      }

      await client.query(
        `UPDATE loans
         SET status = 'defaulted', closed_at = NOW()
         WHERE id = $1`,
        [loan.id]
      );

      await client.query(
        `INSERT INTO loan_events (loan_id, event_type, note)
         VALUES ($1, 'defaulted', 'Loan defaulted automatically due to past due date')`,
        [loan.id]
      );

      await client.query(
        `INSERT INTO transactions_log (community_id, actor_address, action, metadata)
         VALUES ($1, $2, 'loan_defaulted', $3)`,
        [
          loan.community_id,
          loan.lender_address,
          JSON.stringify({ loan_id: loan.id, auto_detected: true }),
        ]
      );

      await bumpReputation(client, loan.community_id, loan.borrower_address, 'defaults');

      return rows[0];
    });

    if (defaulted) {
      processed.push(defaulted);
    }
  }

  return processed;
}
