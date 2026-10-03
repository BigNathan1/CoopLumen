import { render, screen } from '@testing-library/react';
import { MyReputationPanel } from '../MyReputationPanel';
import type { ReputationDetail } from '@/hooks/useReputation';
import * as hook from '@/hooks/useReputation';

const address = 'G' + 'A'.repeat(55);

const detail: ReputationDetail = {
  address,
  communities: [
    {
      id: 'rep-1',
      stellar_address: address,
      community_id: 'community-1',
      score: '87.50',
      total_loans: 5,
      on_time_repayments: 4,
      defaults: 1,
      last_calculated_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ],
  summary: { total_loans: 5, on_time_repayments: 4, defaults: 1 },
};

type UseDetailReturn = ReturnType<typeof hook.useReputationDetail>;

function mockDetail(value: Partial<UseDetailReturn>): void {
  jest.spyOn(hook, 'useReputationDetail').mockReturnValue(value as UseDetailReturn);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('MyReputationPanel', () => {
  it('shows a loading state', () => {
    mockDetail({ isLoading: true });
    render(<MyReputationPanel address={address} />);
    expect(screen.getByText('Loading your reputation…')).toBeInTheDocument();
  });

  it('treats a 404/error as no reputation yet', () => {
    mockDetail({ error: new Error('Not found'), isLoading: false });
    render(<MyReputationPanel address={address} />);
    expect(screen.getByText(/No reputation yet/)).toBeInTheDocument();
  });

  it('renders the aggregate summary and per-community score', () => {
    mockDetail({ data: detail, isLoading: false });
    render(<MyReputationPanel address={address} />);
    expect(screen.getByText('on time')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument(); // 87.50 rounded
  });
});
