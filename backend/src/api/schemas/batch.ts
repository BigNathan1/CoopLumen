import { z } from 'zod';
import { StrKey } from '@stellar/stellar-sdk';
import { isValidStellarPublicKey } from '../utils/stellar';

const stellarPublicKey = z
  .string()
  .trim()
  .refine(isValidStellarPublicKey, 'must be a valid Stellar public key');

const stellarSecretKey = z
  .string()
  .trim()
  .refine((val) => StrKey.isValidEd25519SecretSeed(val), 'must be a valid Stellar secret seed');

const amount = z
  .string()
  .trim()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/, 'amount must be a positive decimal string')
  .refine((val) => Number(val) > 0, 'amount must be greater than zero');

const textMemo = z
  .string()
  .trim()
  .refine((val) => Buffer.byteLength(val, 'utf8') <= 28, {
    message: 'memo must be 28 bytes or fewer',
  });

export const batchPaymentEntrySchema = z
  .object({
    destinationPublicKey: stellarPublicKey,
    assetCode: z
      .string()
      .trim()
      .min(1, 'assetCode is required')
      .max(12, 'assetCode must be 12 characters or fewer')
      .regex(/^[A-Za-z0-9]+$/, 'assetCode must be alphanumeric'),
    assetIssuer: z.string().trim().optional(),
    amount,
  })
  .superRefine(({ assetCode, assetIssuer }, ctx) => {
    if (assetCode !== 'XLM' && !assetIssuer) {
      ctx.addIssue({
        code: 'custom',
        path: ['assetIssuer'],
        message: 'assetIssuer is required for non-XLM assets',
      });
    }
    if (assetIssuer && !isValidStellarPublicKey(assetIssuer)) {
      ctx.addIssue({
        code: 'custom',
        path: ['assetIssuer'],
        message: 'assetIssuer must be a valid Stellar public key',
      });
    }
  });

export type BatchPaymentEntryInput = z.infer<typeof batchPaymentEntrySchema>;

export const batchDisburseSchema = z.object({
  senderSecret: stellarSecretKey,
  payments: z
    .array(batchPaymentEntrySchema)
    .min(1, 'at least one payment entry is required')
    .max(100, 'at most 100 payments can be processed in a single batch'),
  memo: textMemo.optional(),
});

export type BatchDisburseInput = z.infer<typeof batchDisburseSchema>;

export const batchPreviewSchema = z.object({
  senderPublicKey: stellarPublicKey,
  payments: z
    .array(batchPaymentEntrySchema)
    .min(1, 'at least one payment entry is required')
    .max(100, 'at most 100 payments can be processed in a single batch'),
  memo: textMemo.optional(),
});

export type BatchPreviewInput = z.infer<typeof batchPreviewSchema>;

export const parseCsvSchema = z.object({
  csv: z.string().min(1, 'CSV content is required'),
  defaultAssetCode: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .regex(/^[A-Za-z0-9]+$/)
    .default('XLM'),
  defaultAssetIssuer: stellarPublicKey.optional(),
});

export type ParseCsvInput = z.infer<typeof parseCsvSchema>;
