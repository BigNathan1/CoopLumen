import { NextFunction, Request, Response, Router } from 'express';
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
