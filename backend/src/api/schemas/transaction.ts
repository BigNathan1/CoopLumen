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
