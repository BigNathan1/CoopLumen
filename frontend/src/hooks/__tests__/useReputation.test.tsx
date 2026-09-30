import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useReputation, useReputationDetail } from '../useReputation';

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const fetchMock = jest.fn();

beforeAll(() => {
  (global as { fetch?: unknown }).fetch = fetchMock as typeof fetch;
});

afterEach(() => {
  fetchMock.mockReset();
});

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  );
}

const ADDRESS = 'G' + 'A'.repeat(55);

describe('useReputation', () => {
  it('fetches the reputation leaderboard for a community', async () => {
    const payload = [
      {
        id: 'score-1',
        stellar_address: ADDRESS,
        community_id: 'community-1',
        score: '95.00',
        total_loans: 3,
        on_time_repayments: 3,
        defaults: 0,
        last_calculated_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ];
    fetchMock.mockResolvedValue(jsonResponse(200, { data: payload }));

    const { result } = renderHook(() => useReputation('community-1', 5), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(payload));
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/api/v1/reputation?limit=5&communityId=community-1'
    );
  });

  it('does not fetch a detail lookup when no address is provided', () => {
    renderHook(() => useReputationDetail(null), { wrapper });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches a member reputation detail when an address is present', async () => {
    const payload = {
      address: ADDRESS,
      communities: [
        {
          id: 'score-1',
          stellar_address: ADDRESS,
          community_id: 'community-1',
          score: '95.00',
          total_loans: 3,
          on_time_repayments: 3,
          defaults: 0,
          last_calculated_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      summary: { total_loans: 3, on_time_repayments: 3, defaults: 0 },
    };
    fetchMock.mockResolvedValue(jsonResponse(200, { data: payload }));

    const { result } = renderHook(() => useReputationDetail(ADDRESS), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(payload));
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/api/v1/reputation/${ADDRESS}`);
  });

  it('surfaces a failed detail request as an error', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'No reputation yet' }));

    const { result } = renderHook(() => useReputationDetail(ADDRESS), { wrapper });

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect((result.current.error as Error).message).toBe('No reputation yet');
  });
});
