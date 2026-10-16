import { z } from 'zod';
import { isValidStellarPublicKey } from '../utils/stellar';

export const proposalIdParamsSchema = z.object({
  id: z.string().uuid({ message: 'id must be a valid UUID' }),
});

export const delegateProposalSchema = z.object({
  delegateeAddress: z.string().trim().refine(isValidStellarPublicKey, {
    message: 'delegateeAddress must be a valid Stellar public key',
  }),
});

export type DelegateProposalInput = z.infer<typeof delegateProposalSchema>;

const proposalStatus = z.enum(['draft', 'active', 'passed', 'rejected', 'executed', 'cancelled']);
const proposalType = z.enum([
  'general',
  'loan_approval',
  'member_removal',
  'treasury_spend',
  'settings_change',
  'token_issuance',
]);

export const proposalIdParamsSchema = z.object({
  id: z.string().uuid({ message: 'Proposal ID must be a valid UUID' }),
});

export const listProposalsQuerySchema = z.object({
  communityId: z.string().uuid({ message: 'communityId must be a valid UUID' }),
  status: proposalStatus.optional(),
});

export const createProposalSchema = z.object({
  communityId: z.string().uuid({ message: 'communityId must be a valid UUID' }),
  title: z.string().trim().min(1, { message: 'title is required' }).max(200),
  description: z.string().trim().max(10_000).optional(),
  type: proposalType.default('general'),
  quorumPercent: z.coerce.number().min(0).max(100).default(50),
  metadata: z.record(z.string(), z.unknown()).optional(),
  votingEndsAt: z.coerce
    .date({ error: 'votingEndsAt must be a valid date' })
    .refine((value) => value.getTime() > Date.now(), {
      message: 'votingEndsAt must be in the future',
    }),
});

export type CreateProposalInput = z.infer<typeof createProposalSchema>;
