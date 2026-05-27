import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../../db';
import { StellarService } from '../../contracts/stellar';
import { parsePagination, pageMeta, parseSort, queryString } from '../utils/http';
import { validateBody } from '../middleware/validate';
import { writeLimiter } from '../middleware/rateLimit';
import {
  createCommunitySchema,
  updateCommunitySchema,
  addMemberSchema,
  updateMemberSchema,
} from '../schemas/community';

export const communityRouter = Router();

interface Community {
  id: string;
  name: string;
  description: string | null;
  issuer_public_key: string;
  asset_code: string;
  asset_issuer: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const VALID_ROLES = ['admin', 'treasurer', 'member', 'observer'];

/**
 * GET /api/communities
 * Paginated, searchable, sortable list of communities.
 * Query: page, limit, search, sortBy (created_at|name|updated_at), order (asc|desc)
 */
communityRouter.get('/', async (req, res, next) => {
  try {
    const pagination = parsePagination(req);
    const { sortBy, order } = parseSort(req, ['created_at', 'name', 'updated_at'], 'created_at');
    const search = queryString(req.query.search).trim();

    const clauses = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    if (search) {
      params.push(search);
      clauses.push(
        `to_tsvector('english', name || ' ' || COALESCE(description, '')) @@ plainto_tsquery('english', $${params.length})`
      );
    }
    const where = `WHERE ${clauses.join(' AND ')}`;

    const [{ count }] = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM communities ${where}`,
      params
    );

    const listParams = [...params, pagination.limit, pagination.offset];
    const communities = await db.query<Community>(
      `SELECT * FROM communities ${where}
       ORDER BY ${sortBy} ${order}
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    res.json({ data: communities, meta: pageMeta(count, pagination) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/communities/search?q=...
 * Dedicated full-text search endpoint over name and description.
 */
communityRouter.get('/search', async (req, res, next) => {
  try {
    const term = (queryString(req.query.q) || queryString(req.query.search)).trim();
    if (!term) {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }
    const pagination = parsePagination(req);
    const params: unknown[] = [term, pagination.limit, pagination.offset];
    const communities = await db.query<Community>(
      `SELECT * FROM communities
       WHERE deleted_at IS NULL
         AND to_tsvector('english', name || ' ' || COALESCE(description, '')) @@ plainto_tsquery('english', $1)
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      params
    );
    res.json({ data: communities });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/communities/:id
 * Single community enriched with member count, token list, and statistics.
 */
communityRouter.get('/:id', async (req, res, next) => {
  try {
    const [community] = await db.query<Community>(
      'SELECT * FROM communities WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!community) {
      res.status(404).json({ error: 'Community not found' });
      return;
    }

    const [{ count: memberCount }] = await db.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM members WHERE community_id = $1 AND deleted_at IS NULL',
      [community.id]
    );
    const tokens = await db.query<{
      asset_code: string;
      asset_issuer: string;
      total_supply: string;
      description: string | null;
      icon_url: string | null;
    }>(
      `SELECT asset_code, asset_issuer, total_supply, description, icon_url
       FROM tokens WHERE community_id = $1`,
      [community.id]
    );
    const [{ count: txCount }] = await db.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM transactions_log WHERE community_id = $1',
      [community.id]
    );

    const totalSupply = tokens.reduce((sum, t) => sum + Number(t.total_supply), 0);

    res.json({
      data: {
        ...community,
        member_count: memberCount,
        tokens,
        stats: {
          total_transactions: txCount,
          total_token_supply: totalSupply,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/communities
 * Registers a new community and records a `community_created` audit event.
 */
communityRouter.post(
  '/',
  writeLimiter,
  validateBody(createCommunitySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, issuerPublicKey, assetCode, assetIssuer } = req.body as {
        name: string;
        description?: string;
        issuerPublicKey: string;
        assetCode: string;
        assetIssuer: string;
      };

      const [existing] = await db.query<Community>(
        'SELECT id FROM communities WHERE name = $1 AND deleted_at IS NULL',
        [name]
      );
      if (existing) {
        res.status(409).json({ error: 'Community name already taken' });
        return;
      }

      const community = await db.transaction(async (client) => {
        const result = await client.query<Community>(
          `INSERT INTO communities (name, description, issuer_public_key, asset_code, asset_issuer)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [name, description ?? null, issuerPublicKey, assetCode, assetIssuer]
        );
        const created = result.rows[0];
        await client.query(
          `INSERT INTO transactions_log (community_id, actor_address, action, metadata)
           VALUES ($1, $2, 'community_created', $3)`,
          [created.id, issuerPublicKey, JSON.stringify({ name, asset_code: assetCode })]
        );
        return created;
      });

      res.status(201).json({ data: community });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/communities/:id
 * Updates name, description, and/or per-community settings.
 */
communityRouter.put(
  '/:id',
  writeLimiter,
  validateBody(updateCommunitySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, settings } = req.body as {
        name?: string;
        description?: string | null;
        settings?: Record<string, unknown>;
      };

      const [community] = await db.query<Community>(
        'SELECT * FROM communities WHERE id = $1 AND deleted_at IS NULL',
        [req.params.id]
      );
      if (!community) {
        res.status(404).json({ error: 'Community not found' });
        return;
      }

      if (name && name !== community.name) {
        const [dup] = await db.query<Community>(
          'SELECT id FROM communities WHERE name = $1 AND deleted_at IS NULL AND id <> $2',
          [name, community.id]
        );
        if (dup) {
          res.status(409).json({ error: 'Community name already taken' });
          return;
        }
      }

      const updated = await db.transaction(async (client) => {
        const result = await client.query<Community>(
          `UPDATE communities
           SET name = COALESCE($1, name),
               description = COALESCE($2, description)
           WHERE id = $3
           RETURNING *`,
          [name ?? null, description === undefined ? null : description, community.id]
        );
        if (settings) {
          await client.query(
            `INSERT INTO community_settings (community_id, settings)
             VALUES ($1, $2)
             ON CONFLICT (community_id) DO UPDATE SET settings = EXCLUDED.settings`,
            [community.id, JSON.stringify(settings)]
          );
        }
        return result.rows[0];
      });

      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/communities/:id
 * Soft-deletes a community by setting `deleted_at`.
 */
communityRouter.delete('/:id', writeLimiter, async (req, res, next) => {
  try {
    const result = await db.query<{ id: string }>(
      'UPDATE communities SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [req.params.id]
    );
    if (result.length === 0) {
      res.status(404).json({ error: 'Community not found' });
      return;
    }
    res.json({ data: { id: result[0].id, deleted: true } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/communities/:id/members
 * Paginated member list with optional role filter.
 */
communityRouter.get('/:id/members', async (req, res, next) => {
  try {
    const pagination = parsePagination(req);
    const role = queryString(req.query.role).trim();

    const clauses = ['community_id = $1', 'deleted_at IS NULL'];
    const params: unknown[] = [req.params.id];
    if (role && VALID_ROLES.includes(role)) {
      params.push(role);
      clauses.push(`role = $${params.length}`);
    }
    const where = `WHERE ${clauses.join(' AND ')}`;

    const [{ count }] = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM members ${where}`,
      params
    );

    const listParams = [...params, pagination.limit, pagination.offset];
    const members = await db.query<{ stellar_address: string; role: string; joined_at: string }>(
      `SELECT stellar_address, role, joined_at FROM members ${where}
       ORDER BY joined_at
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    res.json({ data: members, meta: pageMeta(count, pagination) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/communities/:id/members
 * Adds a member after validating the Stellar address.
 */
communityRouter.post(
  '/:id/members',
  writeLimiter,
  validateBody(addMemberSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { stellarAddress, role } = req.body as { stellarAddress: string; role?: string };

      const [community] = await db.query<Community>(
        'SELECT id FROM communities WHERE id = $1 AND deleted_at IS NULL',
        [req.params.id]
      );
      if (!community) {
        res.status(404).json({ error: 'Community not found' });
        return;
      }

      await db.query(
        `INSERT INTO members (community_id, stellar_address, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (community_id, stellar_address)
         DO UPDATE SET role = EXCLUDED.role, deleted_at = NULL`,
        [req.params.id, stellarAddress, role ?? 'member']
      );
      res.status(201).json({ data: { message: 'Member added' } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/communities/:id/members/:address
 * Fetches a single member's details.
 */
communityRouter.get('/:id/members/:address', async (req, res, next) => {
  try {
    const [member] = await db.query<{ stellar_address: string; role: string; joined_at: string }>(
      `SELECT stellar_address, role, joined_at FROM members
       WHERE community_id = $1 AND stellar_address = $2 AND deleted_at IS NULL`,
      [req.params.id, req.params.address]
    );
    if (!member) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }
    res.json({ data: member });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/communities/:id/members/:address
 * Updates a member's role.
 */
communityRouter.put(
  '/:id/members/:address',
  writeLimiter,
  validateBody(updateMemberSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role } = req.body as { role: string };
      const result = await db.query<{ stellar_address: string; role: string }>(
        `UPDATE members SET role = $1
         WHERE community_id = $2 AND stellar_address = $3 AND deleted_at IS NULL
         RETURNING stellar_address, role`,
        [role, req.params.id, req.params.address]
      );
      if (result.length === 0) {
        res.status(404).json({ error: 'Member not found' });
        return;
      }
      res.json({ data: result[0] });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/communities/:id/members/:address
 * Soft-removes a member from the community.
 */
communityRouter.delete('/:id/members/:address', writeLimiter, async (req, res, next) => {
  try {
    const result = await db.query<{ stellar_address: string }>(
      `UPDATE members SET deleted_at = NOW()
       WHERE community_id = $1 AND stellar_address = $2 AND deleted_at IS NULL
       RETURNING stellar_address`,
      [req.params.id, req.params.address]
    );
    if (result.length === 0) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }
    res.json({ data: { stellar_address: result[0].stellar_address, removed: true } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/communities/:id/treasury
 * Returns the treasury (issuer) account's on-chain balances.
 */
communityRouter.get('/:id/treasury', async (req, res, next) => {
  try {
    const [community] = await db.query<Community>(
      'SELECT issuer_public_key FROM communities WHERE id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    if (!community) {
      res.status(404).json({ error: 'Community not found' });
      return;
    }
    const balances = await StellarService.getAccountBalance(community.issuer_public_key);
    res.json({ data: { account: community.issuer_public_key, balances } });
  } catch (err) {
    next(err);
  }
});
