import { NextFunction, Request, Response, Router } from 'express';
import { PoolClient } from 'pg';
import { db } from '../../db';
import { requireAuth } from '../middleware/auth';
import { validateBody, validateParams } from '../middleware/validate';
import {
  delegateProposalSchema,
  DelegateProposalInput,
import { db } from '../../db';
import { requireAuth } from '../middleware/auth';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import {
  CreateProposalInput,
  createProposalSchema,
  listProposalsQuerySchema,
  proposalIdParamsSchema,
} from '../schemas/proposal';

export const proposalRouter = Router();

class ProposalRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ProposalRequestError';
  }
}

interface ProposalRow {
  id: string;
  community_id: string;
  status: string;
  voting_ends_at: Date | string;
}

interface DelegationRow {
  proposal_id: string;
  delegator_address: string;
  delegatee_address: string;
  created_at: Date | string;
  updated_at: Date | string;
}

async function saveDelegation(
  client: PoolClient,
  proposalId: string,
  delegatorAddress: string,
  delegateeAddress: string
): Promise<DelegationRow> {
  const proposalResult = await client.query<ProposalRow>(
    `SELECT id, community_id, status, voting_ends_at
       FROM proposals
      WHERE id = $1
      FOR UPDATE`,
    [proposalId]
  );
  const proposal = proposalResult.rows[0];
  if (!proposal) {
    throw new ProposalRequestError('Proposal not found', 404);
  }
  if (proposal.status !== 'active' || new Date(proposal.voting_ends_at).getTime() < Date.now()) {
    throw new ProposalRequestError('Proposal is not accepting delegations', 409);
  }

  const members = await client.query<{ stellar_address: string }>(
    `SELECT stellar_address
       FROM members
      WHERE community_id = $1
        AND stellar_address = ANY($2::text[])
        AND deleted_at IS NULL`,
    [proposal.community_id, [delegatorAddress, delegateeAddress]]
  );
  const activeAddresses = new Set(members.rows.map((member) => member.stellar_address));
  if (!activeAddresses.has(delegatorAddress) || !activeAddresses.has(delegateeAddress)) {
    throw new ProposalRequestError(
      'Delegator and delegatee must be active members of the proposal community',
      403
    );
  }

  const priorVotes = await client.query<{ voter_address: string }>(
    `SELECT voter_address
       FROM votes
      WHERE proposal_id = $1
        AND voter_address = ANY($2::text[])
      LIMIT 1`,
    [proposalId, [delegatorAddress, delegateeAddress]]
  );
  if (priorVotes.rows.length > 0) {
    throw new ProposalRequestError(
      'Voting power cannot be delegated after either account votes',
      409
    );
  }

  const chain = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM proposal_delegations
        WHERE proposal_id = $1
          AND (delegatee_address = $2 OR delegator_address = $3)
     ) AS exists`,
    [proposalId, delegatorAddress, delegateeAddress]
  );
  if (chain.rows[0]?.exists) {
    throw new ProposalRequestError('Delegation chains and cycles are not allowed', 409);
  }

  const result = await client.query<DelegationRow>(
    `INSERT INTO proposal_delegations
       (proposal_id, delegator_address, delegatee_address)
     VALUES ($1, $2, $3)
     ON CONFLICT (proposal_id, delegator_address)
     DO UPDATE SET delegatee_address = EXCLUDED.delegatee_address
     RETURNING proposal_id, delegator_address, delegatee_address, created_at, updated_at`,
    [proposalId, delegatorAddress, delegateeAddress]
  );
  return result.rows[0];
}

proposalRouter.post(
  '/:id/delegate',
  requireAuth,
  validateParams(proposalIdParamsSchema),
  validateBody(delegateProposalSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const delegatorAddress = req.auth!.address;
    const { delegateeAddress } = req.body as DelegateProposalInput;
    if (delegatorAddress === delegateeAddress) {
      res.status(400).json({ data: null, error: 'Cannot delegate voting power to yourself' });
      return;
    }

    try {
      const delegation = await db.transaction((client) =>
        saveDelegation(client, req.params.id, delegatorAddress, delegateeAddress)
      );
      res.status(200).json({
        data: {
          proposalId: delegation.proposal_id,
          delegatorAddress: delegation.delegator_address,
          delegateeAddress: delegation.delegatee_address,
          createdAt: delegation.created_at,
          updatedAt: delegation.updated_at,
        },
      });
const proposalSelect = `
  SELECT p.*,
         COALESCE(SUM(v.weight) FILTER (WHERE v.choice = 'for'), 0)::text AS votes_for,
         COALESCE(SUM(v.weight) FILTER (WHERE v.choice = 'against'), 0)::text AS votes_against,
         COALESCE(SUM(v.weight) FILTER (WHERE v.choice = 'abstain'), 0)::text AS votes_abstain
    FROM proposals p
    LEFT JOIN votes v ON v.proposal_id = p.id`;

proposalRouter.get(
  '/',
  validateQuery(listProposalsQuerySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { communityId, status } = req.query as {
        communityId: string;
        status?: string;
      };
      const proposals = await db.query(
        `${proposalSelect}
          WHERE p.community_id = $1
            AND ($2::text IS NULL OR p.status = $2)
          GROUP BY p.id
          ORDER BY p.created_at DESC`,
        [communityId, status ?? null]
      );
      res.json({ data: proposals });
    } catch (error) {
      next(error);
    }
  }
);

proposalRouter.get(
  '/:id',
  validateParams(proposalIdParamsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [proposal] = await db.query(
        `${proposalSelect}
          WHERE p.id = $1
          GROUP BY p.id`,
        [req.params.id]
      );
      if (!proposal) {
        res.status(404).json({ data: null, error: 'Proposal not found' });
        return;
      }
      res.json({ data: proposal });
    } catch (error) {
      next(error);
    }
  }
);

proposalRouter.post(
  '/',
  requireAuth,
  validateBody(createProposalSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.body as CreateProposalInput;
      const [proposal] = await db.query(
        `INSERT INTO proposals
           (community_id, proposer_address, title, description, type, status,
            quorum_percent, metadata, voting_starts_at, voting_ends_at)
         SELECT $1, $2, $3, $4, $5, 'active', $6, $7::jsonb, NOW(), $8
           FROM members
          WHERE community_id = $1
            AND stellar_address = $2
            AND deleted_at IS NULL
         RETURNING *`,
        [
          input.communityId,
          req.auth!.address,
          input.title,
          input.description ?? null,
          input.type,
          input.quorumPercent,
          JSON.stringify(input.metadata ?? {}),
          input.votingEndsAt,
        ]
      );

      if (!proposal) {
        res.status(403).json({
          data: null,
          error: 'Only active community members can create proposals',
        });
        return;
      }

      res.status(201).json({ data: proposal });
    } catch (error) {
      next(error);
    }
  }
);
