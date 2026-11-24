import { NextFunction, Request, Response, Router } from 'express';
import { PoolClient } from 'pg';
import { db } from '../../db';
import { requireAuth } from '../middleware/auth';
import { validateBody, validateParams } from '../middleware/validate';
import {
  initiateKycSchema,
  InitiateKycInput,
  kycStatusParamsSchema,
  worldIdVerifySchema,
  WorldIdVerifyInput,
} from '../schemas/kyc';

export const kycRouter = Router();

type StoredKycStatus = 'pending' | 'submitted' | 'verified' | 'rejected' | 'expired';
type PublicKycStatus = 'none' | 'pending' | 'approved' | 'rejected';

function toPublicStatus(status: StoredKycStatus | undefined): PublicKycStatus {
  if (!status) return 'none';
  if (status === 'verified') return 'approved';
  if (status === 'pending' || status === 'submitted') return 'pending';
  return 'rejected';
}

interface WorldIdStatus {
  verified: boolean;
  verifiedAt: string | null;
  verificationLevel: string | null;
}

async function getWorldIdStatus(address: string): Promise<WorldIdStatus> {
  const [record] = await db.query<{
    verified_at: Date | string;
    verification_level: string | null;
  }>(
    `SELECT verified_at, verification_level
       FROM worldid_verifications
      WHERE user_id = $1
      ORDER BY verified_at DESC
      LIMIT 1`,
    [address]
  );

  if (!record) {
    return { verified: false, verifiedAt: null, verificationLevel: null };
  }

  return {
    verified: true,
    verifiedAt:
      record.verified_at instanceof Date
        ? record.verified_at.toISOString()
        : String(record.verified_at),
    verificationLevel: record.verification_level,
  };
}

/** Returns the latest KYC outcome recorded for a Stellar account. */
kycRouter.get(
  '/status/:address',
  validateParams(kycStatusParamsSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [record] = await db.query<{ status: StoredKycStatus }>(
        `SELECT status
           FROM kyc_records
          WHERE stellar_address = $1
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 1`,
        [req.params.address]
      );

      const worldId = await getWorldIdStatus(req.params.address);

      res.json({
        data: {
          address: req.params.address,
          status: toPublicStatus(record?.status),
          worldId,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

class KycInitiationError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'KycInitiationError';
  }
}

interface KycRecord {
  id: string;
  community_id: string;
  stellar_address: string;
  status: 'pending' | 'submitted' | 'verified' | 'rejected' | 'expired';
  provider: string | null;
  updated_at: Date | string;
}

async function initiateKyc(
  client: PoolClient,
  input: InitiateKycInput
): Promise<{ record: KycRecord; started: boolean }> {
  const member = await client.query(
    `SELECT 1
       FROM members
      WHERE community_id = $1
        AND stellar_address = $2
        AND deleted_at IS NULL`,
    [input.communityId, input.address]
  );
  if (member.rows.length === 0) {
    throw new KycInitiationError('Address is not an active member of the community', 403);
  }

  const existingResult = await client.query<KycRecord>(
    `SELECT id, community_id, stellar_address, status, provider, updated_at
       FROM kyc_records
      WHERE community_id = $1 AND stellar_address = $2
      FOR UPDATE`,
    [input.communityId, input.address]
  );
  const existing = existingResult.rows[0];
  if (existing?.status === 'verified') {
    throw new KycInitiationError('Address is already verified', 409);
  }
  if (existing?.status === 'pending' || existing?.status === 'submitted') {
    return { record: existing, started: false };
  }

  if (existing) {
    const restarted = await client.query<KycRecord>(
      `UPDATE kyc_records
          SET status = 'pending',
              provider = $3,
              provider_reference = NULL,
              verified_at = NULL,
              rejected_reason = NULL
        WHERE community_id = $1 AND stellar_address = $2
        RETURNING id, community_id, stellar_address, status, provider, updated_at`,
      [input.communityId, input.address, input.provider]
    );
    return { record: restarted.rows[0], started: true };
  }

  const created = await client.query<KycRecord>(
    `INSERT INTO kyc_records (community_id, stellar_address, status, provider)
     VALUES ($1, $2, 'pending', $3)
     RETURNING id, community_id, stellar_address, status, provider, updated_at`,
    [input.communityId, input.address, input.provider]
  );
  return { record: created.rows[0], started: true };
}

kycRouter.post(
  '/initiate',
  requireAuth,
  validateBody(initiateKycSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const input = req.body as InitiateKycInput;
    if (req.auth!.address !== input.address) {
      res.status(403).json({ data: null, error: 'KYC can only be initiated for your own address' });
      return;
    }

    try {
      const result = await db.transaction((client) => initiateKyc(client, input));
      res.status(result.started ? 201 : 200).json({
        data: {
          id: result.record.id,
          communityId: result.record.community_id,
          address: result.record.stellar_address,
          status: 'pending',
          provider: result.record.provider,
          initiatedAt: result.record.updated_at,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

class WorldIdVerificationError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'WorldIdVerificationError';
  }
}

interface WorldIdProofResult {
  success: boolean;
  error?: string;
}

/**
 * Validates a World ID proof against the Worldcoin verification API.
 * The signal is bound to the authenticated user's address so a proof cannot
 * be replayed on behalf of another account.
 */
async function verifyWorldIdProof(input: WorldIdVerifyInput): Promise<WorldIdProofResult> {
  const verifyUrl =
    process.env.WORLDID_VERIFY_URL ??
    `https://developer.worldcoin.org/api/v2/verify/${encodeURIComponent(input.app_id)}`;

  let response: globalThis.Response;
  try {
    response = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: input.action,
        signal: input.signal,
        proof: input.proof,
        merkle_root: input.merkle_root,
        nullifier_hash: input.nullifier_hash,
        verification_level: input.verification_level,
      }),
    });
  } catch (error) {
    throw new WorldIdVerificationError('Unable to reach World ID verification service', 502);
  }

  if (!response.ok) {
    let detail = 'Invalid World ID proof';
    try {
      const body = (await response.json()) as { detail?: string; code?: string };
      if (body?.detail) detail = body.detail;
    } catch {
      // ignore parse errors, fall back to generic message
    }
    throw new WorldIdVerificationError(detail, 400);
  }

  return { success: true };
}

kycRouter.post(
  '/worldid/verify',
  requireAuth,
  validateBody(worldIdVerifySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const input = req.body as WorldIdVerifyInput;
    const address = req.auth!.address;

    // The signal must be bound to the authenticated user to prevent replay.
    if (input.signal !== address) {
      res.status(400).json({
        data: null,
        error: 'World ID signal must match the authenticated address',
      });
      return;
    }

    try {
      await verifyWorldIdProof(input);

      const result = await db.transaction(async (client) => {
        // Enforce one-person-one-account: a nullifier may only be used once.
        const existingNullifier = await client.query<{ user_id: string }>(
          `SELECT user_id
             FROM worldid_verifications
            WHERE nullifier_hash = $1
            FOR UPDATE`,
          [input.nullifier_hash]
        );

        if (existingNullifier.rows.length > 0) {
          const owner = existingNullifier.rows[0].user_id;
          if (owner !== address) {
            throw new WorldIdVerificationError(
              'This World ID has already been used to verify another account',
              409
            );
          }
          // Same user re-verifying: refresh the record.
          const updated = await client.query<{
            verified_at: Date | string;
            verification_level: string | null;
          }>(
            `UPDATE worldid_verifications
                SET verified_at = NOW(),
                    verification_level = $2,
                    updated_at = NOW()
              WHERE user_id = $1 AND nullifier_hash = $3
              RETURNING verified_at, verification_level`,
            [address, input.verification_level, input.nullifier_hash]
          );
          return updated.rows[0];
        }

        // Ensure the user does not already have a different nullifier bound.
        const existingUser = await client.query<{ nullifier_hash: string }>(
          `SELECT nullifier_hash
             FROM worldid_verifications
            WHERE user_id = $1
            FOR UPDATE`,
          [address]
        );
        if (existingUser.rows.length > 0) {
          throw new WorldIdVerificationError(
            'This account is already linked to a different World ID',
            409
          );
        }

        const inserted = await client.query<{
          verified_at: Date | string;
          verification_level: string | null;
        }>(
          `INSERT INTO worldid_verifications
             (user_id, nullifier_hash, verification_level, verified_at)
           VALUES ($1, $2, $3, NOW())
           RETURNING verified_at, verification_level`,
          [address, input.nullifier_hash, input.verification_level]
        );
        return inserted.rows[0];
      });

      res.status(200).json({
        data: {
          address,
          verified: true,
          verifiedAt:
            result.verified_at instanceof Date
              ? result.verified_at.toISOString()
              : String(result.verified_at),
          verificationLevel: result.verification_level,
        },
      });
    } catch (error) {
      if (error instanceof WorldIdVerificationError) {
        res.status(error.status).json({ data: null, error: error.message });
        return;
      }
      // Unique constraint violation on nullifier_hash (race condition fallback).
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === '23505'
      ) {
        res.status(409).json({
          data: null,
          error: 'This World ID has already been used to verify another account',
        });
        return;
      }
      next(error);
    }
  }
);