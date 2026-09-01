import { renderHook, act } from '@testing-library/react';
import { useCreateLoan } from '../useCreateLoan';

const mutate = jest.fn();
jest.mock('swr', () => ({
  mutate: (...args: unknown[]) => mutate(...args),
}));

const input = {
  communityId: 'community-1',
  borrowerAddress: 'G' + 'C'.repeat(55),
  lenderAddress: 'G' + 'B'.repeat(55),
  amount: '50',
  assetCode: 'ECO',
};

/** Minimal stand-in for a fetch Response (jsdom provides no global fetch). */
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

describe('useCreateLoan', () => {
  it('POSTs the payload and revalidates loan lists on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { data: { id: 'loan-1' } }));

    const { result } = renderHook(() => useCreateLoan());
    let returned: unknown;
    await act(async () => {
      returned = await result.current.createLoan(input);
    });

    expect(returned).toEqual({ id: 'loan-1' });
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/v1/loans');
    expect(options).toMatchObject({ method: 'POST' });
    expect(JSON.parse((options as RequestInit).body as string)).toEqual(input);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('surfaces the API error and does not revalidate', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'Community not found' }));

    const { result } = renderHook(() => useCreateLoan());
    let returned: unknown;
    await act(async () => {
      returned = await result.current.createLoan(input);
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe('Community not found');
    expect(mutate).not.toHaveBeenCalled();
  });
});
