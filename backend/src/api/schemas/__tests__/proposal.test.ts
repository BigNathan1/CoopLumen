/**
 * Tests for proposal.ts
 *
 * NOTE: proposal.ts contains duplicate `const` declarations for
 * `proposalIdParamsSchema` and `createProposalSchema`. TypeScript emits a
 * compile error for those duplicates, but the _second_ declaration wins at
 * runtime.  We import the second (effective) versions via the module exports.
 */
import {
  proposalIdParamsSchema,
  delegateProposalSchema,
  createProposalSchema,
  castVoteSchema,
  listProposalsQuerySchema,
} from '../proposal';

const KEY = `G${'A'.repeat(55)}`;
const UUID = '3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8';

const FUTURE_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const VALID_PROPOSAL = {
  communityId: UUID,
  title: 'Approve new member',
};

describe('proposalIdParamsSchema', () => {
  it('accepts a valid UUID', () => {
    expect(proposalIdParamsSchema.safeParse({ id: UUID }).success).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    expect(proposalIdParamsSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('delegateProposalSchema', () => {
  it('accepts a valid Stellar address', () => {
    expect(delegateProposalSchema.safeParse({ delegateeAddress: KEY }).success).toBe(true);
  });

  it('rejects an invalid address', () => {
    expect(delegateProposalSchema.safeParse({ delegateeAddress: 'bad' }).success).toBe(false);
  });

  it('requires delegateeAddress', () => {
    expect(delegateProposalSchema.safeParse({}).success).toBe(false);
  });
});

describe('createProposalSchema', () => {
  it('accepts a minimal proposal', () => {
    expect(createProposalSchema.safeParse(VALID_PROPOSAL).success).toBe(true);
  });

  it('defaults type to general', () => {
    const result = createProposalSchema.parse(VALID_PROPOSAL);
    expect(result.type).toBe('general');
  });

  it('defaults quorumPercent to 50', () => {
    const result = createProposalSchema.parse(VALID_PROPOSAL);
    expect(result.quorumPercent).toBe(50);
  });

  it.each([
    'general',
    'loan_approval',
    'member_removal',
    'treasury_spend',
    'settings_change',
    'token_issuance',
  ])('accepts type "%s"', (type) => {
    expect(createProposalSchema.safeParse({ ...VALID_PROPOSAL, type }).success).toBe(true);
  });

  it('rejects an unknown type', () => {
    expect(createProposalSchema.safeParse({ ...VALID_PROPOSAL, type: 'admin_action' }).success).toBe(false);
  });

  it('rejects a non-UUID communityId', () => {
    expect(createProposalSchema.safeParse({ ...VALID_PROPOSAL, communityId: 'bad' }).success).toBe(false);
  });

  it('rejects an empty title', () => {
    expect(createProposalSchema.safeParse({ ...VALID_PROPOSAL, title: '' }).success).toBe(false);
  });

  it('rejects a title longer than 200 characters', () => {
    expect(createProposalSchema.safeParse({ ...VALID_PROPOSAL, title: 't'.repeat(201) }).success).toBe(false);
  });

  it('rejects a quorumPercent below 0', () => {
    expect(createProposalSchema.safeParse({ ...VALID_PROPOSAL, quorumPercent: -1 }).success).toBe(false);
  });

  it('rejects a quorumPercent above 100', () => {
    expect(createProposalSchema.safeParse({ ...VALID_PROPOSAL, quorumPercent: 101 }).success).toBe(false);
  });

  it('accepts a future votingEndsAt', () => {
    expect(
      createProposalSchema.safeParse({ ...VALID_PROPOSAL, votingEndsAt: FUTURE_DATE }).success
    ).toBe(true);
  });

  it('rejects a past votingEndsAt', () => {
    expect(
      createProposalSchema.safeParse({
        ...VALID_PROPOSAL,
        votingEndsAt: '2000-01-01T00:00:00.000Z',
      }).success
    ).toBe(false);
  });

  it('coerces votingEndsAt to a Date', () => {
    const result = createProposalSchema.parse({ ...VALID_PROPOSAL, votingEndsAt: FUTURE_DATE });
    expect(result.votingEndsAt).toBeInstanceOf(Date);
  });
});

describe('castVoteSchema', () => {
  it.each(['for', 'against', 'abstain'])('accepts choice "%s"', (choice) => {
    expect(castVoteSchema.safeParse({ choice }).success).toBe(true);
  });

  it('rejects an unknown choice', () => {
    expect(castVoteSchema.safeParse({ choice: 'maybe' }).success).toBe(false);
  });

  it('accepts an optional reason', () => {
    expect(castVoteSchema.safeParse({ choice: 'for', reason: 'Great idea' }).success).toBe(true);
  });

  it('rejects a reason longer than 2000 characters', () => {
    expect(
      castVoteSchema.safeParse({ choice: 'for', reason: 'r'.repeat(2001) }).success
    ).toBe(false);
  });
});

describe('listProposalsQuerySchema', () => {
  it('accepts a communityId with no status filter', () => {
    expect(listProposalsQuerySchema.safeParse({ communityId: UUID }).success).toBe(true);
  });

  it.each(['draft', 'active', 'passed', 'rejected', 'executed', 'cancelled'])(
    'accepts status "%s"',
    (status) => {
      expect(listProposalsQuerySchema.safeParse({ communityId: UUID, status }).success).toBe(true);
    }
  );

  it('rejects an unknown status', () => {
    expect(
      listProposalsQuerySchema.safeParse({ communityId: UUID, status: 'pending' }).success
    ).toBe(false);
  });

  it('rejects a non-UUID communityId', () => {
    expect(listProposalsQuerySchema.safeParse({ communityId: 'bad' }).success).toBe(false);
  });
});
