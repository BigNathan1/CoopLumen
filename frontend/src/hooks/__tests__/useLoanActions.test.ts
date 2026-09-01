import { renderHook, act } from '@testing-library/react';
import { useLoanActions } from '../useLoanActions';

const mutate = jest.fn().mockResolvedValue(undefined);
jest.mock('swr', () => ({
  mutate: (...args: unknown[]) => mutate(...args),
}));

const loanId = 'loan-1';

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const fetchMock = jest.fn();

beforeAll(() => {
  (global as { fetch?: unknown }).fetch = fetchMock;
});

afterEach(() => {
  fetchMock.mockReset();
  mutate.mockClear();
});

describe('useLoanActions', () => {
  it('disburses via POST and revalidates', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { id: loanId, status: 'active' } }));
    const { result } = renderHook(() => useLoanActions(loanId));

    await act(async () => {
      await result.current.disburse();
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`/api/v1/loans/${loanId}/disburse`);
    expect(options).toMatchObject({ method: 'POST' });
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('repays with the amount in the body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { id: loanId, status: 'active' } }));
    const { result } = renderHook(() => useLoanActions(loanId));

    await act(async () => {
      await result.current.repay('25');
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`/api/v1/loans/${loanId}/repay`);
    expect(JSON.parse((options as RequestInit).body as string)).toEqual({ amount: '25' });
  });

  it('cancels via DELETE', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { id: loanId } }));
    const { result } = renderHook(() => useLoanActions(loanId));

    await act(async () => {
      await result.current.cancel();
    });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
  });

  it('surfaces an error and does not revalidate on failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { error: 'Cannot disburse' }));
    const { result } = renderHook(() => useLoanActions(loanId));

    await act(async () => {
      await result.current.disburse();
    });

    expect(result.current.error).toBe('Cannot disburse');
    expect(mutate).not.toHaveBeenCalled();
  });
});
