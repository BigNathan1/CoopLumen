import { z } from 'zod';

export const MULTISIG_ACTIONS = [
  'payment',
  'token_issue',
  'trustline',
  'settings_update',
  'member_role_change',
  'signer_update',
] as const;

export const MULTISIG_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'executed',
  'expired',
  'cancelled',
] as const;

export const createMultiSigRequestSchema = z.object({
  action: z.enum(MULTISIG_ACTIONS),
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().max(1000).optional().nullable(),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
  transaction_xdr: z.string().optional().nullable(),
  required_signatures: z.number().int().min(1).optional().default(2),
  proposer_address: z.string().min(1, 'Proposer address is required'),
  expires_at: z.string().optional().nullable(),
});

export const approveMultiSigRequestSchema = z.object({
  signed_xdr: z.string().optional().nullable(),
  signer_address: z.string().optional().nullable(),
});

export const rejectMultiSigRequestSchema = z.object({
  reason: z.string().max(500).optional().nullable(),
});

export const executeMultiSigRequestSchema = z.object({
  stellar_tx_hash: z.string().min(1, 'Stellar transaction hash is required'),
});

export const getMultiSigQuerySchema = z.object({
  status: z.enum(MULTISIG_STATUSES).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});
