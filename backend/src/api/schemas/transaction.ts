import { z } from 'zod';
import { isValidStellarPublicKey } from '../utils/stellar';

const stellarPublicKey = z
  .string()
  .trim()
  .refine(isValidStellarPublicKey, 'must be a valid Stellar public key');

const amount = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/, 'amount must be a positive decimal string')
  .refine((value) => Number(value) > 0, 'amount must be greater than zero');

const textMemo = z
  .string()
  .trim()
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 28, {
    message: 'memo must be 28 bytes or fewer',
  });

/**
 * Accepts either a bare string (a text memo, the original shape) or a tagged
 * object, so hash memos can be requested without breaking existing clients.
 */
const memoSchema = z.union([
  textMemo,
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('text'), value: textMemo }),
  z.object({
    type: z.literal('hash'),
    value: z
      .string()
      .trim()
      .regex(/^[0-9a-fA-F]{64}$/, 'hash memo must be exactly 64 hexadecimal characters (32 bytes)'),
  }),
]);

export const unsignedPaymentSchema = z
  .object({
    senderPublicKey: stellarPublicKey,
    destinationPublicKey: stellarPublicKey,
    assetCode: z
      .string()
      .trim()
      .min(1, 'assetCode is required')
      .max(12, 'assetCode must be 12 characters or fewer')
      .regex(/^[A-Za-z0-9]+$/, 'assetCode must be alphanumeric'),
    assetIssuer: stellarPublicKey.optional(),
    amount,
    memo: memoSchema.optional(),
  })
  .superRefine(({ assetCode, assetIssuer }, context) => {
    if (assetCode !== 'XLM' && !assetIssuer) {
      context.addIssue({
        code: 'custom',
        path: ['assetIssuer'],
        message: 'assetIssuer is required for non-XLM assets',
      });
    }
  });

export type UnsignedPaymentInput = z.infer<typeof unsignedPaymentSchema>;

// --- NEW SCHEMAS FOR ISSUE #147 & #148 ---

export const submitTransactionSchema = z.object({
  xdr: z.string().min(1, 'Signed XDR string is required'),
});

export const getCommunityTransactionsSchema = z.object({
  params: z.object({
    communityId: z.string().uuid('Invalid community ID format'),
  }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    from: z.string().datetime('from must be a valid ISO 8601 date').optional(),
    to: z.string().datetime('to must be a valid ISO 8601 date').optional(),
  }),
});
  }),
});
export const transactionHashSchema = z.object({
  hash: z
    .string()
    .trim()
    .length(64, 'Transaction hash must be exactly 64 characters long')
    .regex(/^[a-fA-F0-9]{64}$/, 'Transaction hash must be a valid hex-encoded SHA-256 string'),
});

export type TransactionHashParams = z.infer<typeof transactionHashSchema>;

/** The `action` values `transactions_log` accepts, per its check constraint. */
export const TRANSACTION_LOG_ACTIONS = [
  'community_created',
  'member_added',
  'member_removed',
  'token_issued',
  'payment_sent',
  'trustline_established',
  'trustline_removed',
  'loan_created',
  'loan_disbursed',
  'loan_repayment',
  'loan_closed',
  'loan_defaulted',
] as const;

const isoDate = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'must be an ISO 8601 date-time string');

export const communityTransactionsQuerySchema = z
  .object({
    page: z.string().trim().optional(),
    limit: z.string().trim().optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    type: z.enum(TRANSACTION_LOG_ACTIONS).optional(),
  })
  .superRefine(({ from, to }, context) => {
    if (from && to && Date.parse(from) > Date.parse(to)) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: '`to` must not be before `from`',
      });
    }
  });

export type CommunityTransactionsQuery = z.infer<typeof communityTransactionsQuerySchema>;
