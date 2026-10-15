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
