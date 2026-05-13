import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { db } from '../../db';

export const communityRouter = Router();

const validate = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  next();
};

interface Community {
  id: string;
  name: string;
  description: string | null;
  issuer_public_key: string;
  asset_code: string;
  asset_issuer: string;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/communities
 * Returns all registered communities.
 */
communityRouter.get('/', async (_req, res, next) => {
  try {
    const communities = await db.query<Community>(
      'SELECT * FROM communities ORDER BY created_at DESC'
    );
    res.json({ data: communities });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/communities/:id
 * Returns a single community by UUID.
 */
communityRouter.get('/:id', async (req, res, next) => {
  try {
    const [community] = await db.query<Community>(
      'SELECT * FROM communities WHERE id = $1',
      [req.params.id]
    );
    if (!community) {
      res.status(404).json({ error: 'Community not found' });
      return;
    }
    res.json({ data: community });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/communities
 * Registers a new community. Caller must supply issuer public key and desired asset code.
 */
communityRouter.post(
  '/',
  [
    body('name').isString().trim().isLength({ min: 2, max: 64 }),
    body('description').optional().isString().trim().isLength({ max: 500 }),
    body('issuerPublicKey').isString().trim().isLength({ min: 56, max: 56 }),
    body('assetCode')
      .isString()
      .trim()
      .isLength({ min: 1, max: 12 })
      .isAlphanumeric(),
    body('assetIssuer').isString().trim().isLength({ min: 56, max: 56 }),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, issuerPublicKey, assetCode, assetIssuer } =
        req.body as {
          name: string;
          description?: string;
          issuerPublicKey: string;
          assetCode: string;
          assetIssuer: string;
        };

      const [existing] = await db.query<Community>(
        'SELECT id FROM communities WHERE name = $1',
        [name]
      );
      if (existing) {
        res.status(409).json({ error: 'Community name already taken' });
        return;
      }

      const [community] = await db.query<Community>(
        `INSERT INTO communities (name, description, issuer_public_key, asset_code, asset_issuer)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [name, description ?? null, issuerPublicKey, assetCode, assetIssuer]
      );

      res.status(201).json({ data: community });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/communities/:id/members
 * Lists all members of a community.
 */
communityRouter.get('/:id/members', async (req, res, next) => {
  try {
    const members = await db.query<{ stellar_address: string; joined_at: string }>(
      'SELECT stellar_address, joined_at FROM members WHERE community_id = $1 ORDER BY joined_at',
      [req.params.id]
    );
    res.json({ data: members });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/communities/:id/members
 * Adds a Stellar address as a member of a community.
 */
communityRouter.post(
  '/:id/members',
  [body('stellarAddress').isString().trim().isLength({ min: 56, max: 56 })],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { stellarAddress } = req.body as { stellarAddress: string };
      await db.query(
        `INSERT INTO members (community_id, stellar_address) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [req.params.id, stellarAddress]
      );
      res.status(201).json({ message: 'Member added' });
    } catch (err) {
      next(err);
    }
  }
);
