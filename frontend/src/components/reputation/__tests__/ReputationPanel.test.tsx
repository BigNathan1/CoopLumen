import { render, screen } from '@testing-library/react';
import { ReputationPanel } from '../ReputationPanel';
import type { ReputationScore } from '@/hooks/useReputation';
import * as hook from '@/hooks/useReputation';

const address = 'G' + 'A'.repeat(55);

const mockScore: ReputationScore = {
  id: 'rep-1',
  stellar_address: address,
  community_id: 'community-1',
  score: '87.50',
  total_loans: 5,
  on_time_repayments: 4,
  defaults: 1,
  last_calculated_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

type UseReputationReturn = ReturnType<typeof hook.useReputation>;

function mockUseReputation(value: Partial<UseReputationReturn>): void {
  jest.spyOn(hook, 'useReputation').mockReturnValue(value as UseReputationReturn);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ReputationPanel', () => {
  it('renders a loading state', () => {
    mockUseReputation({ isLoading: true });
    render(<ReputationPanel />);
    expect(screen.getByText('Loading reputation…')).toBeInTheDocument();
  });

  it('renders an error state', () => {
    mockUseReputation({ error: new Error('boom'), isLoading: false });
    render(<ReputationPanel />);
    expect(screen.getByText('Failed to load reputation')).toBeInTheDocument();
  });

  it('renders an empty state', () => {
    mockUseReputation({ data: [], isLoading: false });
    render(<ReputationPanel />);
    expect(screen.getByText('No reputation scores yet')).toBeInTheDocument();
  });

  it('renders a ranked entry with a shortened address and rounded score', () => {
    mockUseReputation({ data: [mockScore], isLoading: false });
    render(<ReputationPanel />);
    expect(screen.getByText('GAAA…AAAA')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
    expect(screen.getByText('4✓ / 1✗')).toBeInTheDocument();
  });
});
