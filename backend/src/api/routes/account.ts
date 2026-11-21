import { Router } from 'express';
import { db } from '../../db';
import { requireAuth } from '../middleware/auth';
import { validateParams } from '../middleware/validate';
import { accountParamsSchema } from '../schemas/account';

export const accountRouter: Router = Router();

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
      const [memberships, loans, loanEvents, reputation, notifications, kyc, trustlines, transactions, auditEvents, multisigRequests] =
        await Promise.all([
          db.query<ExportRow>('SELECT * FROM members WHERE stellar_address = $1 ORDER BY joined_at', [publicKey]),
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
          db.query<ExportRow>('SELECT * FROM kyc_records WHERE stellar_address = $1 ORDER BY created_at', [publicKey]),
          db.query<ExportRow>('SELECT * FROM trustlines WHERE stellar_address = $1 ORDER BY established_at', [publicKey]),
          db.query<ExportRow>('SELECT * FROM transactions_log WHERE actor_address = $1 ORDER BY created_at', [publicKey]),
          db.query<ExportRow>('SELECT * FROM audit_log WHERE actor_address = $1 ORDER BY created_at', [publicKey]),
          db.query<ExportRow>(
            'SELECT * FROM multisig_requests WHERE proposer_address = $1 ORDER BY created_at',
            [publicKey]
          ),
        ]);

      const exportedAt = new Date().toISOString();
      res.setHeader('Content-Disposition', `attachment; filename="cooplumen-data-${publicKey.slice(0, 10)}.json"`);
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
