import { renderHook, act } from '@testing-library/react';
import { useCreateCommunity } from '../useCreateCommunity';

const mutate = jest.fn();
jest.mock('swr', () => ({
  mutate: (...args: unknown[]) => mutate(...args),
}));

const input = {
  name: 'Test Community',
  description: 'A test community',
  issuerPublicKey: 'G' + 'C'.repeat(55),
  assetCode: 'TEST',
  assetIssuer: 'G' + 'I'.repeat(55),
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

describe('useCreateCommunity', () => {
  it('POSTs the payload, optimistically updates lists, and revalidates on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { data: { id: 'community-1', name: 'Test Community' } }));

    const { result } = renderHook(() => useCreateCommunity());
    let returned: unknown;
    await act(async () => {
      returned = await result.current.createCommunity(input);
    });

    expect(returned).toEqual({ id: 'community-1', name: 'Test Community' });
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/v1/communities');
    expect(options).toMatchObject({ method: 'POST' });
    expect(JSON.parse((options as RequestInit).body as string)).toEqual(input);

    // Should be called twice: once for optimistic update, once for revalidation
    expect(mutate).toHaveBeenCalledTimes(2);

    // First call: optimistic update with function
    const [optimisticKey, optimisticUpdater, optimisticOptions] = mutate.mock.calls[0];
    expect(typeof optimisticKey).toBe('function');
    expect(typeof optimisticUpdater).toBe('function');
    expect(optimisticOptions).toEqual({ revalidate: false });

    // Second call: revalidation
    const [revalidateKey, revalidateData, revalidateOptions] = mutate.mock.calls[1];
    expect(typeof revalidateKey).toBe('function');
    expect(revalidateData).toBeUndefined();
    expect(revalidateOptions).toEqual({ revalidate: true });

    expect(result.current.error).toBeNull();
  });

  it('optimistically updates, then rolls back and surfaces the API error on failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { error: 'Community name already taken' }));

    const { result } = renderHook(() => useCreateCommunity());
    let returned: unknown;
    await act(async () => {
      returned = await result.current.createCommunity(input);
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe('Community name already taken');

    // Should be called twice: once for optimistic update, once for rollback revalidation
    expect(mutate).toHaveBeenCalledTimes(2);

    // First call: optimistic update
    const [, , optimisticOptions] = mutate.mock.calls[0];
    expect(optimisticOptions).toEqual({ revalidate: false });

    // Second call: rollback revalidation
    const [, , revalidateOptions] = mutate.mock.calls[1];
    expect(revalidateOptions).toEqual({ revalidate: true });
  });

  it('tracks submitting state during the request', async () => {
    let resolveFetch: (value: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    fetchMock.mockReturnValue(fetchPromise);

    const { result } = renderHook(() => useCreateCommunity());

    expect(result.current.submitting).toBe(false);

    const promise = act(async () => {
      const p = result.current.createCommunity(input);
      // Check submitting is true while request is in flight
      expect(result.current.submitting).toBe(true);
      resolveFetch!(jsonResponse(201, { data: { id: 'community-1' } }));
      return p;
    });

    await promise;
    expect(result.current.submitting).toBe(false);
  });

  it('clears previous error on new submission', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(400, { error: 'Invalid input' }))
      .mockResolvedValueOnce(jsonResponse(201, { data: { id: 'community-2' } }));

    const { result } = renderHook(() => useCreateCommunity());

    await act(async () => {
      await result.current.createCommunity(input);
    });
    expect(result.current.error).toBe('Invalid input');

    await act(async () => {
      await result.current.createCommunity({ ...input, name: 'Another Community' });
    });
    expect(result.current.error).toBeNull();
  });
});