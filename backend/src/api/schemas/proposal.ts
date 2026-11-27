import { z } from 'zod';
import { isValidStellarPublicKey } from '../utils/stellar';

export const proposalIdParamsSchema = z.object({
  id: z.string().uuid({ message: 'Proposal ID must be a valid UUID' }),
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

export const createProposalSchema = z.object({
  communityId: z.string().uuid({ message: 'Community ID must be a valid UUID' }),
  title: z.string().trim().min(1, { message: 'title is required' }).max(200),
  description: z.string().trim().max(10_000).optional(),
  type: proposalType.default('general'),
  quorumPercent: z.coerce.number().min(0).max(100).default(50),
  votingDurationHours: z.coerce
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(24),
  metadata: z.record(z.string(), z.unknown()).optional(),
  start_time: z.coerce.date().optional(),
  end_time: z.coerce.date().optional(),
  votingEndsAt: z.coerce
    .date({ error: 'votingEndsAt must be a valid date' })
    .refine((value) => value.getTime() > Date.now(), {
      message: 'votingEndsAt must be in the future',
    })
    .optional(),
});

export type CreateProposalInput = z.infer<typeof createProposalSchema>;

export const castVoteSchema = z.object({
  choice: z.enum(['for', 'against', 'abstain']),
  reason: z.string().trim().max(2_000).optional(),
});

export const executeProposalSchema = z
  .object({
    executorAddress: z
      .string()
      .trim()
      .refine(isValidStellarPublicKey, {
        message: 'executorAddress must be a valid Stellar public key',
      })
      .optional(),
  })
  .strict();

export type ExecuteProposalInput = z.infer<typeof executeProposalSchema>;

export const listProposalsQuerySchema = z.object({
  communityId: z.string().uuid({ message: 'communityId must be a valid UUID' }),
  status: proposalStatus.optional(),
});

export const communityIdParamsSchema = z.object({
  communityId: z.string().uuid({ message: 'Community ID must be a valid UUID' }),
});

export type CommunityIdParams = z.infer<typeof communityIdParamsSchema>;

export const proposalDetailParamsSchema = proposalIdParamsSchema;

export type ProposalDetailParams = z.infer<typeof proposalDetailParamsSchema>;

const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;

export const submitVoteSchema = z.object({
  signedXdr: z
    .string()
    .trim()
    .min(1, { message: 'signedXdr is required' })
    .refine((value) => value.length % 4 === 0 && base64Pattern.test(value), {
      message: 'signedXdr must be a base64-encoded signed transaction envelope',
    }),
  memo: z.string().trim().max(28).optional(),
  reason: z.string().trim().max(2_000).optional(),
});

export type SubmitVoteInput = z.infer<typeof submitVoteSchema>;
