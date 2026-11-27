import { render, screen, waitFor } from '@testing-library/react';
import { useReputation } from '../useReputation';

function ReputationProbe({ address }: { address?: string | null }) {
  const { data, isLoading, error } = useReputation(address);
  if (isLoading) return <div role="status">Loading reputation...</div>;
  if (error) return <div role="alert">{error}</div>;
  if (!data) return <div>No reputation</div>;
  return (
    <div>
      <span data-testid="rep-score">{data.score}</span>
      <span data-testid="rep-address">{data.address}</span>
    </div>
  );
}

describe('useReputation', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    // jsdom has no fetch of its own; give spyOn a function to wrap.
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  test('skips fetch when address is empty or invalid', () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as never);
    render(<ReputationProbe address="" />);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByText('No reputation')).toBeInTheDocument();
  });

  test('loads and renders reputation data for a valid address', async () => {
    const validAddr = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    jest.spyOn(global, 'fetch' as never).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          address: validAddr,
          score: 740,
          completedLoans: 3,
          onTimeRepayments: 3,
        },
      }),
    } as never);

    render(<ReputationProbe address={validAddr} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading reputation...');

    await waitFor(() => {
      expect(screen.getByTestId('rep-score')).toHaveTextContent('740');
    });
  });

  test('surfaces error state on failed API response', async () => {
    const validAddr = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    jest.spyOn(global, 'fetch' as never).mockResolvedValue({
      ok: false,
      status: 502,
    } as never);

    render(<ReputationProbe address={validAddr} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Failed to load reputation (502)');
    });
  });
});
