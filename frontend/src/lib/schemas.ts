/**
 * Shared Zod validation schemas for the CoopLumen frontend.
 *
 * These mirror the request schemas the backend enforces in
 * `backend/src/api/schemas/`, so a form can reject bad input before it costs a
 * round trip and the user sees the same rule stated the same way on both sides.
 * The backend remains the authority: nothing here is a substitute for
 * server-side validation, it is a faster first opinion.
 *
 * Messages are written for people, not for logs, because they are rendered
 * directly under the field that failed.
 */

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A Stellar account address: `G` followed by 55 base32 characters.
 *
 * The backend additionally verifies the StrKey CRC16 checksum. Reproducing that
 * in the browser would mean shipping the Stellar SDK for a validity check, so
 * this covers the shape errors people actually make (wrong length, a pasted
 * secret key, lowercase, `0`/`1`/`8`/`9` from a misread character) and leaves
 * the checksum to the server.
 */
export const stellarPublicKeySchema = z
  .string()
  .trim()
  .min(1, 'Stellar address is required')
  .regex(/^G[A-Z2-7]{55}$/, 'Enter a valid Stellar public key (starts with G, 56 characters)');

/** Stellar asset codes are 1-12 alphanumeric characters. */
export const assetCodeSchema = z
  .string()
  .trim()
  .min(1, 'Asset code is required')
  .max(12, 'Asset code must be 12 characters or fewer')
  .regex(/^[A-Za-z0-9]+$/, 'Asset code must be letters and numbers only');

/**
 * A positive amount with at most 7 decimal places, kept as a string.
 *
 * Stellar amounts are fixed-point to 7 places; parsing them into a JavaScript
 * number loses precision for large balances, so the value never becomes a
 * number on its way to the API.
 */
export const amountSchema = z
  .string()
  .trim()
  .min(1, 'Amount is required')
  .regex(/^\d+(\.\d{1,7})?$/, 'Enter a positive amount with up to 7 decimal places')
  .refine((value) => Number(value) > 0, 'Amount must be greater than zero');

/** Identifier format used for every resource the API returns. */
export const uuidSchema = z.uuid('Must be a valid ID');

/** Roles a community member can hold, matching the backend enum. */
export const memberRoleSchema = z.enum(['admin', 'treasurer', 'member', 'observer']);

/**
 * UTF-8 byte length of a string, counted without `TextEncoder`.
 *
 * Iterating code points keeps this working wherever the schemas are evaluated,
 * including test environments that do not expose the encoding globals.
 */
function utf8ByteLength(value: string): number {
  let bytes = 0;

  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }

  return bytes;
}

/**
 * A text memo, capped at Stellar's 28-byte limit.
 *
 * The limit is bytes rather than characters, so a 28-character string of emoji
 * or accented text does not fit.
 */
export const textMemoSchema = z
  .string()
  .trim()
  .refine((value) => utf8ByteLength(value) <= 28, 'Memo must be 28 bytes or fewer');

/** A 32-byte hash memo, written as 64 hexadecimal characters. */
export const hashMemoSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{64}$/, 'Hash memo must be exactly 64 hexadecimal characters');

/** Either a bare text memo or the tagged object form the API also accepts. */
export const memoSchema = z.union([
  textMemoSchema,
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('text'), value: textMemoSchema }),
  z.object({ type: z.literal('hash'), value: hashMemoSchema }),
]);

/* -------------------------------------------------------------------------- */
/* Communities                                                                */
/* -------------------------------------------------------------------------- */

export const createCommunitySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(64, 'Name must be 64 characters or fewer'),
  description: z.string().trim().max(500, 'Description must be 500 characters or fewer').optional(),
  issuerPublicKey: stellarPublicKeySchema,
  assetCode: assetCodeSchema,
  assetIssuer: stellarPublicKeySchema,
});

/**
 * A partial update. At least one field must be present, mirroring the
 * backend's refinement, so an empty PATCH is rejected in the form rather than
 * silently succeeding as a no-op.
 */
export const updateCommunitySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(64, 'Name must be 64 characters or fewer')
      .optional(),
    description: z
      .string()
      .trim()
      .max(500, 'Description must be 500 characters or fewer')
      .nullable()
      .optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.description !== undefined || value.settings !== undefined,
    { message: 'Change at least one field before saving', path: ['name'] }
  );

export const setAvatarSchema = z.object({
  avatarUrl: z
    .url('Enter a valid URL')
    .max(2048, 'URL must be 2048 characters or fewer')
    .refine((value) => value.startsWith('https://'), 'Avatar URL must use https'),
});

/* -------------------------------------------------------------------------- */
/* Members                                                                    */
/* -------------------------------------------------------------------------- */

export const addMemberSchema = z.object({
  stellarAddress: stellarPublicKeySchema,
  role: memberRoleSchema.optional(),
});

export const updateMemberSchema = z.object({
  role: memberRoleSchema,
});

/* -------------------------------------------------------------------------- */
/* Stellar operations                                                         */
/* -------------------------------------------------------------------------- */

export const buildTrustlineSchema = z.object({
  accountPublicKey: stellarPublicKeySchema,
  assetCode: assetCodeSchema,
  assetIssuer: stellarPublicKeySchema,
  limit: amountSchema.optional(),
});

/**
 * A payment request. `assetIssuer` is required for every asset except native
 * XLM, which has no issuer; the check lives on the issuer field so the message
 * lands where the user has to act.
 */
export const paymentSchema = z
  .object({
    senderPublicKey: stellarPublicKeySchema,
    destinationPublicKey: stellarPublicKeySchema,
    assetCode: assetCodeSchema,
    assetIssuer: stellarPublicKeySchema.optional(),
    amount: amountSchema,
    memo: memoSchema.optional(),
  })
  .refine(({ assetCode, assetIssuer }) => assetCode === 'XLM' || Boolean(assetIssuer), {
    message: 'Issuer is required for assets other than XLM',
    path: ['assetIssuer'],
  });

export const createLoanSchema = z.object({
  communityId: uuidSchema,
  borrowerAddress: stellarPublicKeySchema,
  lenderAddress: stellarPublicKeySchema,
  amount: amountSchema,
  assetCode: assetCodeSchema,
  assetIssuer: stellarPublicKeySchema.optional(),
  purpose: z.string().trim().max(280, 'Purpose must be 280 characters or fewer').optional(),
  dueAt: z.coerce.date().optional(),
});

/* -------------------------------------------------------------------------- */
/* Query parameters                                                           */
/* -------------------------------------------------------------------------- */

/** List query for paginated endpoints; values are coerced from the URL. */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be 1 or greater').default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be 1 or greater')
    .max(100, 'Limit must be 100 or fewer')
    .default(20),
  search: z.string().trim().default(''),
  sortBy: z.enum(['created_at', 'name', 'updated_at']).default('created_at'),
  order: z.enum(['ASC', 'DESC']).default('DESC'),
});

/* -------------------------------------------------------------------------- */
/* Inferred types                                                             */
/* -------------------------------------------------------------------------- */

export type StellarPublicKey = z.infer<typeof stellarPublicKeySchema>;
export type MemberRole = z.infer<typeof memberRoleSchema>;
export type Memo = z.infer<typeof memoSchema>;
export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
export type UpdateCommunityInput = z.infer<typeof updateCommunitySchema>;
export type SetAvatarInput = z.infer<typeof setAvatarSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type BuildTrustlineInput = z.infer<typeof buildTrustlineSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type CreateLoanInput = z.infer<typeof createLoanSchema>;
export type ListQueryInput = z.infer<typeof listQuerySchema>;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Flattens a `ZodError` into a `field -> message` map keyed by dotted path,
 * which is the shape form code wants when deciding what to render under each
 * control. The first issue per field wins, because that is the one to fix
 * first. Form-level issues (an empty path) are keyed under `''`.
 */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.join('.');
    if (!(key in fieldErrors)) {
      fieldErrors[key] = issue.message;
    }
  }

  return fieldErrors;
}

/**
 * Parses a value and returns either the parsed data or a `field -> message`
 * map, so a caller can branch without a try/catch or a `success` check.
 */
export function parseWithFieldErrors<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown
): { success: true; data: z.infer<TSchema> } | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(value);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, errors: toFieldErrors(result.error) };
}
