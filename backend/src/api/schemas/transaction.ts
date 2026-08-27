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
    memo: z
      .string()
      .trim()
      .refine((value) => Buffer.byteLength(value, 'utf8') <= 28, {
        message: 'memo must be 28 bytes or fewer',
      })
      .optional(),
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
    type: z.enum(['payment', 'issuance', 'burn', 'trustline']).optional(),
  }),
});