import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProposalDetail from '../ProposalDetail';

jest.mock('@/hooks/useProposal', () => ({
  useProposal: jest.fn(),
}));

import { useProposal } from '@/hooks/useProposal';

const mockedUseProposal = useProposal as jest.MockedFunction<typeof useProposal>;

function mockResult(overrides: Record<string, unknown>) {
  return {
    data: undefined,
    error: undefined,
    isLoading: false,
    mutate: jest.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useProposal>;
}

const baseProposal = {
  id: 'prop-1',
  community_id: 'community-1',
  proposer_address: 'GABC',
  title: 'Increase Community Treasury Allocation',
  description: 'A proposal to increase the treasury allocation for community grants.',
  type: 'treasury_spend',
  status: 'active',
  quorum_percent: '50',
  metadata: null,
  voting_starts_at: '2026-01-01T00:00:00.000Z',
  voting_ends_at: '2026-01-08T00:00:00.000Z',
  executed_at: null,
  stellar_tx_hash: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  votes_for: '300',
  votes_against: '100',
  votes_abstain: '100',
  total_weight: '500',
  tally: { for: '300', against: '100', abstain: '100', totalWeight: '500' },
};

describe('ProposalDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the title, description and status', () => {
    mockedUseProposal.mockReturnValue(mockResult({ data: baseProposal }));

    render(<ProposalDetail proposalId="prop-1" />);

    expect(
      screen.getByRole('heading', { name: /increase community treasury allocation/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/a proposal to increase the treasury allocation/i)).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('computes tally percentages correctly', () => {
    mockedUseProposal.mockReturnValue(mockResult({ data: baseProposal }));

    render(<ProposalDetail proposalId="prop-1" />);

    expect(screen.getByText('(60.0%)')).toBeInTheDocument();
    expect(screen.getAllByText('(20.0%)')).toHaveLength(2);
    expect(screen.getAllByText('500').length).toBeGreaterThan(0);
  });

  it('shows an empty state before any votes are cast', () => {
    mockedUseProposal.mockReturnValue(
      mockResult({
        data: {
          ...baseProposal,
          tally: { for: '0', against: '0', abstain: '0', totalWeight: '0' },
        },
      })
    );

    render(<ProposalDetail proposalId="prop-1" />);

    expect(screen.getByText(/no votes have been cast yet/i)).toBeInTheDocument();
  });

  it('shows an error state when the request fails', () => {
    mockedUseProposal.mockReturnValue(mockResult({ error: new Error('boom') }));

    render(<ProposalDetail proposalId="prop-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load this proposal/i);
  });
});
