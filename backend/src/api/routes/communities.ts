import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import { StellarService } from '../../contracts/stellar';
import { parsePagination, pageMeta, parseSort, queryString } from '../utils/http';
import { validateBody, validateParams } from '../middleware/validate';
import { writeLimiter } from '../middleware/rateLimit';
import { isValidStellarPublicKey } from '../utils/stellar';
import {
  createCommunitySchema,
  updateCommunitySchema,
  addMemberSchema,
  updateMemberSchema,
  setAvatarSchema,
  communityIdParamsSchema,
} from '../schemas/community';

export const communityRouter = Router();

interface Community {
  id: string;
  name: string;
  description: string | null;
  issuer_public_key: string;
  asset_code: string;
  asset_issuer: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const VALID_ROLES = ['admin', 'treasurer', 'member', 'observer'];

/**
 * @route GET /api/v1/communities
 * @access Public
 * @description Paginated, searchable, sortable list of communities.
 * @param {number} [page] - 1-based page number.
 * @param {number} [limit] - Page size, capped at 100.
 * @param {string} [search] - Full-text search over name and description.
 * @param {string} [sortBy=created_at] - One of created_at | name | updated_at.
 * @param {string} [order=desc] - One of asc | desc.
 * @returns {200} `{ data: Community[], meta: PageMeta }`
 * @see docs/openapi.yaml — GET /api/v1/communities
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
 * @route GET /api/v1/communities/search
 * @access Public
 * @description Dedicated full-text search over community name and description.
 * @param {string} q - Required search query text; 400 if missing or blank.
 * @param {number} [page] - 1-based page number.
 * @param {number} [limit] - Page size, capped at 100.
 * @param {string} [sortBy=created_at] - One of created_at | name | updated_at.
 * @param {string} [order=desc] - One of asc | desc.
 * @returns {200} `{ data: Community[], meta: PageMeta }`
 * @returns {400} Missing or blank `q` query parameter.
 * @see docs/openapi.yaml — GET /api/v1/communities/search
 */
communityRouter.get('/search', async (req, res, next) => {
  try {
    const q = queryString(req.query.q).trim();
    if (!q) {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    const pagination = parsePagination(req);
    const { sortBy, order } = parseSort(req, ['created_at', 'name', 'updated_at'], 'created_at');

    const where = `WHERE deleted_at IS NULL AND to_tsvector('english', name || ' ' || COALESCE(description, '')) @@ plainto_tsquery('english', $1)`;
    const params: unknown[] = [q];

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
 * @route GET /api/v1/communities/:id
 * @access Public
 * @description Single community enriched with member count, token list, and statistics.
 * @param {string} id - Community UUID.
 * @returns {200} `{ data: CommunityDetail }`
 * @returns {404} Community not found or soft-deleted.
 * @see docs/openapi.yaml — GET /api/v1/communities/{id}
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
 * @route POST /api/v1/communities
 * @access Public
 * @description Registers a new community and records a `community_created` audit
 * event to `transactions_log` in the same database transaction as the insert.
 * @param {string} body.name - 2-64 characters, must be unique among active communities.
 * @param {string} [body.description] - Up to 500 characters.
 * @param {string} body.issuerPublicKey - Stellar StrKey of the treasury/issuer account.
 * @param {string} body.assetCode - 1-12 character Stellar asset code.
 * @param {string} body.assetIssuer - Stellar StrKey of the asset issuer.
 * @returns {201} `{ data: Community }`
 * @returns {400} Validation failure (Zod), errors nested under `meta.errors`.
 * @returns {409} Community name already taken.
 * @see docs/openapi.yaml — POST /api/v1/communities
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
 * @route PUT /api/v1/communities/:id
 * @access Public
 * @description Updates name, description, and/or per-community settings.
 * @param {string} id - Community UUID.
 * @param {string} [body.name] - 2-64 characters, must be unique among active communities.
 * @param {string|null} [body.description] - Up to 500 characters.
 * @param {object} [body.settings] - Upserted into `community_settings`.
 * @returns {200} `{ data: Community }`
 * @returns {404} Community not found or soft-deleted.
 * @returns {409} Community name already taken by another community.
 * @see docs/openapi.yaml — PUT /api/v1/communities/{id}
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
 * @route DELETE /api/v1/communities/:id
 * @access Public
 * @description Soft-deletes a community by setting `deleted_at`.
 * @param {string} id - Community UUID.
 * @returns {200} `{ data: { id, deleted: true } }`
 * @returns {400} `:id` is not a valid UUID.
 * @returns {404} Community not found or already soft-deleted.
 * @see docs/openapi.yaml — DELETE /api/v1/communities/{id}
 */
communityRouter.delete('/:id', writeLimiter, async (req, res, next) => {
  if (!z.string().uuid().safeParse(req.params.id).success) {
    res.status(400).json({
      error: 'Validation failed',
      meta: { errors: [{ path: 'id', message: 'id must be a valid UUID' }] },
    });
    return;
  }

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
 * @route GET /api/v1/communities/:id/members
 * @access Public
 * @description Paginated member list with optional role filter.
 * @param {string} id - Community UUID.
 * @param {number} [page] - 1-based page number.
 * @param {number} [limit] - Page size, capped at 100.
 * @param {string} [role] - One of admin | treasurer | member | observer; ignored if unrecognized.
 * @returns {200} `{ data: Member[], meta: PageMeta }`
 * @see docs/openapi.yaml — GET /api/v1/communities/{id}/members
 */
communityRouter.get('/:id/members', async (req, res, next) => {
  try {
    const role = queryString(req.query.role).trim();
    if (role && !VALID_ROLES.includes(role)) {
      res.status(400).json({
        error: 'Validation failed',
        meta: {
          errors: [{ path: 'role', message: `role must be one of: ${VALID_ROLES.join(', ')}` }],
        },
      });
      return;
    }

    const pagination = parsePagination(req);
    const clauses = ['community_id = $1', 'deleted_at IS NULL'];
    const params: unknown[] = [req.params.id];
    if (role) {
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
 * @route POST /api/v1/communities/:id/members
 * @access Public
 * @description Adds a member after validating the Stellar address. Re-adding a
 * previously removed address reactivates it rather than failing on conflict.
 * @param {string} id - Community UUID.
 * @param {string} body.stellarAddress - 56-character Stellar StrKey.
 * @param {string} [body.role=member] - One of admin | treasurer | member | observer.
 * @returns {201} `{ data: Member }`
 * @returns {400} Validation failure (Zod), errors nested under `meta.errors`.
 * @returns {404} Community not found or soft-deleted.
 * @see docs/openapi.yaml — POST /api/v1/communities/{id}/members
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

      const result = await db.query<{ stellar_address: string; role: string; joined_at: string }>(
        `INSERT INTO members (community_id, stellar_address, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (community_id, stellar_address)
         DO UPDATE SET role = EXCLUDED.role, deleted_at = NULL
         RETURNING stellar_address, role, joined_at`,
        [req.params.id, stellarAddress, role ?? 'member']
      );
      res.status(201).json({ data: result[0] });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @route GET /api/v1/communities/:id/members/:address
 * @access Public
 * @description Fetches a single member's details.
 * @param {string} id - Community UUID.
 * @param {string} address - Stellar StrKey; rejected with 400 if not structurally valid.
 * @returns {200} `{ data: Member }`
 * @returns {400} `address` is not a structurally valid Stellar StrKey.
 * @returns {404} Member not found or soft-removed.
 * @see docs/openapi.yaml — GET /api/v1/communities/{id}/members/{address}
 */
communityRouter.get('/:id/members/:address', async (req, res, next) => {
  try {
    // Validate Stellar address in path parameter
    if (!isValidStellarPublicKey(req.params.address)) {
      res.status(400).json({ error: 'Invalid Stellar address' });
      return;
    }

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
 * @route PUT /api/v1/communities/:id/members/:address
 * @access Public
 * @description Updates a member's role.
 * @param {string} id - Community UUID.
 * @param {string} address - Stellar StrKey; rejected with 400 if not structurally valid.
 * @param {string} body.role - One of admin | treasurer | member | observer.
 * @returns {200} `{ data: Member }`
 * @returns {400} Invalid `role`, or `address` is not a structurally valid Stellar StrKey.
 * @returns {404} Member not found or soft-removed.
 * @see docs/openapi.yaml — PUT /api/v1/communities/{id}/members/{address}
 */
communityRouter.put(
  '/:id/members/:address',
  writeLimiter,
  validateBody(updateMemberSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate Stellar address in path parameter
      if (!isValidStellarPublicKey(req.params.address)) {
        res.status(400).json({ error: 'Invalid Stellar address' });
        return;
      }

      const { role } = req.body as { role: string };
      const result = await db.query<{ stellar_address: string; role: string; joined_at: string }>(
        `UPDATE members SET role = $1
         WHERE community_id = $2 AND stellar_address = $3 AND deleted_at IS NULL
         RETURNING stellar_address, role, joined_at`,
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
 * @route DELETE /api/v1/communities/:id/members/:address
 * @access Public
 * @description Soft-removes a member from the community; the address can be re-added later.
 * @param {string} id - Community UUID.
 * @param {string} address - Stellar StrKey; rejected with 400 if not structurally valid.
 * @returns {200} `{ data: { stellar_address, removed: true } }`
 * @returns {400} `address` is not a structurally valid Stellar StrKey.
 * @returns {404} Member not found or already soft-removed.
 * @see docs/openapi.yaml — DELETE /api/v1/communities/{id}/members/{address}
 */
communityRouter.delete('/:id/members/:address', writeLimiter, async (req, res, next) => {
  try {
    // Validate Stellar address in path parameter
    if (!isValidStellarPublicKey(req.params.address)) {
      res.status(400).json({ error: 'Invalid Stellar address' });
      return;
    }

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
 * @route GET /api/v1/communities/:id/treasury
 * @access Public
 * @description Returns the treasury (issuer) account's on-chain balances, fetched
 * live from Stellar Horizon via {@link StellarService.getAccountBalance}.
 * @param {string} id - Community UUID.
 * @returns {200} `{ data: { account, balances } }`
 * @returns {404} Community not found or soft-deleted.
 * @see docs/openapi.yaml — GET /api/v1/communities/{id}/treasury
 */
communityRouter.get(
  '/:id/treasury',
  validateParams(communityIdParamsSchema),
  async (req, res, next) => {
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
  }
);

/**
 * @route POST /api/v1/communities/:id/avatar
 * @access Public
 * @description Sets the community's avatar image URL.
 * @param {string} id - Community UUID.
 * @param {string} body.avatarUrl - Absolute URL, up to 2048 characters.
 * @returns {200} `{ data: { id, avatar_url } }`
 * @returns {400} Validation failure (Zod), errors nested under `meta.errors`.
 * @returns {404} Community not found or soft-deleted.
 * @see docs/openapi.yaml — POST /api/v1/communities/{id}/avatar
 */
communityRouter.post(
  '/:id/avatar',
  writeLimiter,
  validateBody(setAvatarSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { avatarUrl } = req.body as { avatarUrl: string };
      const result = await db.query<Community>(
        `UPDATE communities SET avatar_url = $1
         WHERE id = $2 AND deleted_at IS NULL
         RETURNING id, avatar_url`,
        [avatarUrl, req.params.id]
      );
      if (result.length === 0) {
        res.status(404).json({ error: 'Community not found' });
        return;
      }
      res.json({ data: result[0] });
    } catch (err) {
      next(err);
    }
  }
);
