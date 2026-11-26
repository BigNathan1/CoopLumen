import { z } from 'zod';
import { isValidStellarPublicKey } from '../utils/stellar';

const stellarPublicKey = z
  .string()
  .trim()
  .refine(isValidStellarPublicKey, { message: 'Invalid Stellar public key' });

/** A positive monetary amount with up to 7 decimal places (Stellar precision). */
const amount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,7})?$/, { message: 'Amount must be a positive number with up to 7 decimals' })
  .refine((v) => Number(v) > 0, { message: 'Amount must be greater than zero' });

export const createLoanSchema = z.object({
  communityId: z.string().uuid(),
  borrowerAddress: stellarPublicKey,
  lenderAddress: stellarPublicKey,
  amount,
  assetCode: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .regex(/^[a-zA-Z0-9]+$/, { message: 'Asset code must be alphanumeric' }),
  assetIssuer: stellarPublicKey.optional(),
  purpose: z.string().trim().max(280).optional(),
  dueAt: z.coerce.date().optional(),
  // Flat interest as a percent of principal (e.g. 5 => 5%). Defaults to 0.
  interestRate: z.coerce.number().min(0).max(1000).optional(),
});

/** A member request funded by the community pool (the community issuer account). */
export const loanRequestSchema = z.object({
  communityId: z.string().uuid(),
  amount,
  purpose: z.string().trim().min(1).max(280).optional(),
  dueAt: z.coerce.date().refine((date) => date.getTime() > Date.now(), {
    message: 'dueAt must be in the future',
  }),
  interestRate: z.coerce.number().min(0).max(1000).optional(),
});

export const disburseLoanSchema = z.object({
  stellarTxHash: z.string().trim().min(1).max(128).optional(),
  note: z.string().trim().max(280).optional(),
});

export const repayLoanSchema = z.object({
  amount,
  paymentId: z.string().uuid().optional(),
  note: z.string().trim().max(280).optional(),
});

/** Path params for `GET /api/v1/loans/borrower/:address`. */
export const borrowerAddressParamSchema = z.object({
  address: stellarPublicKey,
});

/** Optional pagination for the borrower loan listing. */
export const borrowerLoansQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const defaultLoanSchema = z.object({
  note: z.string().trim().max(280).optional(),
});

/** Loan lifecycle statuses exposed by the list endpoint. */
export const LOAN_LIST_STATUSES = ['pending', 'active', 'closed'] as const;
export type LoanListStatus = (typeof LOAN_LIST_STATUSES)[number];

/** Path params for `GET /api/v1/loans/:communityId`. */
export const listLoansParamsSchema = z.object({
  communityId: z.string().uuid(),
});

/**
 * Query params for `GET /api/v1/loans/:communityId`.
 * `status` is the public lifecycle bucket; the DB stores `repaid`, `defaulted`
 * and `cancelled` separately, all of which map to the public `closed` bucket.
 */
export const listLoansQuerySchema = z.object({
  status: z.enum(LOAN_LIST_STATUSES).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sortBy: z.enum(['createdAt', 'dueAt', 'amount']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/** Path params for `GET /api/v1/reputation/:address`. */
export const reputationAddressParamsSchema = z.object({
  address: stellarPublicKey,
});

/** Query params for `GET /api/v1/reputation/:address`. */
export const reputationQuerySchema = z.object({
  communityId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
