import { Router, NextFunction, Request, Response } from 'express';
import { db } from '../../db';
import { requireAuth } from '../middleware/auth';
import { validateParams } from '../middleware/validate';
import { accountParamsSchema } from '../schemas/account';
import { revokeRefreshTokensForAddress } from '../utils/refreshToken';

export const accountRouter = Router();

type ExportRow = Record<string, unknown>;

/**
 * Returns all CoopLumen records directly associated with the authenticated
 * Stellar account. The address in the path must be the session owner so this
 * endpoint cannot be used to enumerate another member's personal data.
 */
accountRouter.get(
  '/:publicKey/export',
  requireAuth,
  validateParams(accountParamsSchema),
  async (req, res, next) => {
    const publicKey = req.params.publicKey;

    if (req.auth?.address !== publicKey) {
      res.status(403).json({ data: null, error: 'You may only export your own account data' });
      return;
    }

    try {
      const [
        memberships,
        loans,
        loanEvents,
        reputation,
        notifications,
        kyc,
        trustlines,
        transactions,
        auditEvents,
        multisigRequests,
      ] = await Promise.all([
        db.query<ExportRow>('SELECT * FROM members WHERE stellar_address = $1 ORDER BY joined_at', [
          publicKey,
        ]),
        db.query<ExportRow>(
          'SELECT * FROM loans WHERE borrower_address = $1 OR lender_address = $1 ORDER BY created_at',
          [publicKey]
        ),
        db.query<ExportRow>(
          `SELECT event.*
             FROM loan_events event
             JOIN loans loan ON loan.id = event.loan_id
             WHERE loan.borrower_address = $1 OR loan.lender_address = $1
             ORDER BY event.created_at`,
          [publicKey]
        ),
        db.query<ExportRow>(
          'SELECT * FROM reputation_scores WHERE stellar_address = $1 ORDER BY created_at',
          [publicKey]
        ),
        db.query<ExportRow>(
          'SELECT * FROM notifications WHERE stellar_address = $1 ORDER BY created_at',
          [publicKey]
        ),
        db.query<ExportRow>(
          'SELECT * FROM kyc_records WHERE stellar_address = $1 ORDER BY created_at',
          [publicKey]
        ),
        db.query<ExportRow>(
          'SELECT * FROM trustlines WHERE stellar_address = $1 ORDER BY established_at',
          [publicKey]
        ),
        db.query<ExportRow>(
          'SELECT * FROM transactions_log WHERE actor_address = $1 ORDER BY created_at',
          [publicKey]
        ),
        db.query<ExportRow>(
          'SELECT * FROM audit_log WHERE actor_address = $1 ORDER BY created_at',
          [publicKey]
        ),
        db.query<ExportRow>(
          'SELECT * FROM multisig_requests WHERE proposer_address = $1 ORDER BY created_at',
          [publicKey]
        ),
      ]);

      const exportedAt = new Date().toISOString();
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="cooplumen-data-${publicKey.slice(0, 10)}.json"`
      );
      res.json({
        data: {
          schemaVersion: '1.0',
          publicKey,
          exportedAt,
          memberships,
          loans,
          loanEvents,
          reputation,
          notifications,
          kyc,
          trustlines,
          transactions,
          auditEvents,
          multisigRequests,
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

accountRouter.delete(
  '/:publicKey',
  requireAuth,
  validateParams(accountParamsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { publicKey } = req.params as { publicKey: string };
    if (req.auth?.address !== publicKey) {
      res.status(403).json({ data: null, error: 'Accounts may only delete their own data' });
      return;
    }

    try {
      const summary = await db.transaction(async (client) => {
        const counts: Record<string, number> = {};
        const remove = async (table: string, column: string): Promise<void> => {
          const result = await client.query(`DELETE FROM ${table} WHERE ${column} = $1`, [
            publicKey,
          ]);
          counts[table] = (counts[table] ?? 0) + (result.rowCount ?? 0);
        };

        await remove('notifications', 'stellar_address');
        await remove('kyc_records', 'stellar_address');
        await remove('reputation_scores', 'stellar_address');
        await remove('trustlines', 'stellar_address');
        await remove('multisig_requests', 'proposer_address');
        await remove('loans', 'borrower_address');
        await remove('loans', 'lender_address');
        await remove('members', 'stellar_address');
        await client.query(
          `UPDATE transactions_log
              SET actor_address = NULL,
                  metadata = COALESCE(metadata, '{}'::jsonb) - 'publicKey' - 'address'
            WHERE actor_address = $1`,
          [publicKey]
        );
        await client.query(
          `UPDATE audit_log SET actor_address = NULL,
             after_state = jsonb_build_object('erased', true)
           WHERE actor_address = $1`,
          [publicKey]
        );
        return counts;
      });

      revokeRefreshTokensForAddress(publicKey);
      res.status(200).json({ data: { deleted: true, publicKey, recordsRemoved: summary } });
    } catch (error) {
      next(error);
    }
  }
);
