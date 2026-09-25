import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { logger } from '../../utils/logger';
import { parsePagination, pageMeta } from '../utils/http';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import {
  createMultiSigRequestSchema,
  approveMultiSigRequestSchema,
  rejectMultiSigRequestSchema,
  executeMultiSigRequestSchema,
  getMultiSigQuerySchema,
} from '../schemas/multisig';
import { z } from 'zod';

export const multisigRouter: Router = Router();

const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid request ID'),
});

const communityIdParamSchema = z.object({
  communityId: z.string().uuid('Invalid community ID'),
});

export interface MultiSigRow {
  id: string;
  community_id: string;
  proposer_address: string;
  action: string;
  title: string;
  description: string | null;
  payload: Record<string, unknown>;
  transaction_xdr: string | null;
  required_signatures: number;
  current_signatures: number;
  status: string;
  stellar_tx_hash: string | null;
  rejection_reason: string | null;
  expires_at: string | null;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/v1/multisig/community/:communityId
 * GET /api/v1/communities/:communityId/multisig
 * Query requests for a community.
 */
async function getCommunityMultiSigRequests(req: Request, res: Response): Promise<void> {
  const { communityId } = req.params;
  const pagination = parsePagination(req);
  const { page, limit, offset } = pagination;
  const status = req.query.status as string | undefined;

  // Verify community exists
  const communityRows = await db.query<{ id: string }>('SELECT id FROM communities WHERE id = $1 AND deleted_at IS NULL', [
    communityId,
  ]);
  if (communityRows.length === 0) {
    res.status(404).json({ data: null, error: 'Community not found' });
    return;
  }

  let countSql = 'SELECT COUNT(*) as total FROM multisig_requests WHERE community_id = $1';
  let querySql = 'SELECT * FROM multisig_requests WHERE community_id = $1';
  const params: unknown[] = [communityId];

  if (status) {
    params.push(status);
    countSql += ` AND status = $${params.length}`;
    querySql += ` AND status = $${params.length}`;
  }

  querySql += ' ORDER BY created_at DESC';

  const countRes = await db.query<{ total: string }>(countSql, params);
  const total = parseInt(countRes[0]?.total ?? '0', 10);

  params.push(limit, offset);
  querySql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const rows = await db.query<MultiSigRow>(querySql, params);

  res.status(200).json({
    data: rows,
    meta: pageMeta(total, pagination),
  });
}

/**
 * POST /api/v1/multisig/community/:communityId
 * Create a new multisig request.
 */
async function createMultiSigRequest(req: Request, res: Response): Promise<void> {
  const { communityId } = req.params;
  const {
    action,
    title,
    description,
    payload,
    transaction_xdr,
    required_signatures,
    proposer_address,
    expires_at,
  } = req.body;

  const communityRows = await db.query<{ id: string }>('SELECT id FROM communities WHERE id = $1 AND deleted_at IS NULL', [
    communityId,
  ]);
  if (communityRows.length === 0) {
    res.status(404).json({ data: null, error: 'Community not found' });
    return;
  }

  const result = await db.query<MultiSigRow>(
    `INSERT INTO multisig_requests (
      community_id, proposer_address, action, title, description,
      payload, transaction_xdr, required_signatures, current_signatures,
      status, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 'pending', $9)
    RETURNING *`,
    [
      communityId,
      proposer_address,
      action,
      title,
      description ?? null,
      JSON.stringify(payload ?? {}),
      transaction_xdr ?? null,
      required_signatures ?? 2,
      expires_at ? new Date(expires_at) : null,
    ]
  );

  res.status(201).json({
    data: result[0],
  });
}

/**
 * GET /api/v1/multisig/requests/:id
 * Get request detail.
 */
async function getMultiSigRequest(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const rows = await db.query<MultiSigRow>('SELECT * FROM multisig_requests WHERE id = $1', [id]);
  if (rows.length === 0) {
    res.status(404).json({ data: null, error: 'MultiSig request not found' });
    return;
  }

  res.status(200).json({
    data: rows[0],
  });
}

/**
 * POST /api/v1/multisig/requests/:id/approve
 * Sign / approve request.
 */
async function approveMultiSigRequest(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { signed_xdr } = req.body ?? {};

  const rows = await db.query<MultiSigRow>('SELECT * FROM multisig_requests WHERE id = $1', [id]);
  if (rows.length === 0) {
    res.status(404).json({ data: null, error: 'MultiSig request not found' });
    return;
  }

  const request = rows[0];
  if (request.status !== 'pending') {
    res.status(400).json({ data: null, error: `Cannot approve request with status '${request.status}'` });
    return;
  }

  const newSignatures = request.current_signatures + 1;
  const newStatus = newSignatures >= request.required_signatures ? 'approved' : 'pending';
  const newXdr = signed_xdr ?? request.transaction_xdr;

  const updatedRows = await db.query<MultiSigRow>(
    `UPDATE multisig_requests
     SET current_signatures = $1, status = $2, transaction_xdr = $3, updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [newSignatures, newStatus, newXdr, id]
  );

  res.status(200).json({
    data: updatedRows[0],
  });
}

/**
 * POST /api/v1/multisig/requests/:id/reject
 * Reject request.
 */
async function rejectMultiSigRequest(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { reason } = req.body ?? {};

  const rows = await db.query<MultiSigRow>('SELECT * FROM multisig_requests WHERE id = $1', [id]);
  if (rows.length === 0) {
    res.status(404).json({ data: null, error: 'MultiSig request not found' });
    return;
  }

  const request = rows[0];
  if (request.status !== 'pending') {
    res.status(400).json({ data: null, error: `Cannot reject request with status '${request.status}'` });
    return;
  }

  const updatedRows = await db.query<MultiSigRow>(
    `UPDATE multisig_requests
     SET status = 'rejected', rejection_reason = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [reason ?? 'Rejected by co-signer', id]
  );

  res.status(200).json({
    data: updatedRows[0],
  });
}

/**
 * POST /api/v1/multisig/requests/:id/execute
 * Execute request on-chain.
 */
async function executeMultiSigRequest(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { stellar_tx_hash } = req.body;

  const rows = await db.query<MultiSigRow>('SELECT * FROM multisig_requests WHERE id = $1', [id]);
  if (rows.length === 0) {
    res.status(404).json({ data: null, error: 'MultiSig request not found' });
    return;
  }

  const request = rows[0];
  if (request.status !== 'approved' && request.status !== 'pending') {
    res.status(400).json({ data: null, error: `Cannot execute request with status '${request.status}'` });
    return;
  }

  const updatedRows = await db.query<MultiSigRow>(
    `UPDATE multisig_requests
     SET status = 'executed', stellar_tx_hash = $1, executed_at = NOW(), updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [stellar_tx_hash, id]
  );

  res.status(200).json({
    data: updatedRows[0],
  });
}

// Routes
multisigRouter.get(
  '/community/:communityId',
  validateParams(communityIdParamSchema),
  validateQuery(getMultiSigQuerySchema),
  getCommunityMultiSigRequests
);

multisigRouter.post(
  '/community/:communityId',
  validateParams(communityIdParamSchema),
  validateBody(createMultiSigRequestSchema),
  createMultiSigRequest
);

multisigRouter.get('/requests/:id', validateParams(uuidParamSchema), getMultiSigRequest);
multisigRouter.post(
  '/requests/:id/approve',
  validateParams(uuidParamSchema),
  validateBody(approveMultiSigRequestSchema),
  approveMultiSigRequest
);
multisigRouter.post(
  '/requests/:id/reject',
  validateParams(uuidParamSchema),
  validateBody(rejectMultiSigRequestSchema),
  rejectMultiSigRequest
);
multisigRouter.post(
  '/requests/:id/execute',
  validateParams(uuidParamSchema),
  validateBody(executeMultiSigRequestSchema),
  executeMultiSigRequest
);
