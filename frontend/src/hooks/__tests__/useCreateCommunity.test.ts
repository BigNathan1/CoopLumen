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
import { api } from '@/lib/api';
import { useCreateCommunity } from '@/hooks/useCreateCommunity';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// mutate is a module-level SWR function; stub it so tests don't trigger real
// SWR revalidation cycles.
jest.mock('swr', () => ({
  ...jest.requireActual<object>('swr'),
  mutate: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/api', () => ({ api: { post: jest.fn() } }));

const VALID_KEY_A = 'G' + 'A'.repeat(55);
const VALID_KEY_B = 'G' + 'B'.repeat(55);

const COMMUNITY_INPUT = {
  name: 'EcoDAO Lagos',
  description: 'A cooperative',
  issuerPublicKey: VALID_KEY_A,
  assetCode: 'ECOLGS',
  assetIssuer: VALID_KEY_B,
};

const COMMUNITY_RESPONSE = {
  id: 'uuid-1',
  name: 'EcoDAO Lagos',
  description: 'A cooperative',
  asset_code: 'ECOLGS',
  asset_issuer: VALID_KEY_B,
  issuer_public_key: VALID_KEY_A,
  created_at: '2025-01-01T00:00:00.000Z',
};

const postMock = api.post as jest.Mock;
const mutateMock = jest.requireMock('swr').mutate as jest.Mock;

afterEach(() => {
  postMock.mockReset();
  mutateMock.mockClear();
});

function mockFetchOk(data: unknown) {
  postMock.mockResolvedValueOnce(data);
}

function mockFetchError(errorMessage: string) {
  postMock.mockRejectedValueOnce(new Error(errorMessage));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useCreateCommunity', () => {
  it('returns initial state with loading=false and error=null', () => {
    const { result } = renderHook(() => useCreateCommunity());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.submit).toBe('function');
  });

  it('sets loading to true while the request is in flight', async () => {
    // Use a promise we control to keep the request "in flight"
    let resolvePost!: (value: unknown) => void;
    postMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePost = resolve;
      })
    );

    const { result } = renderHook(() => useCreateCommunity());

    // Start the call without awaiting
    act(() => {
      void result.current.submit(COMMUNITY_INPUT);
    });

    expect(result.current.loading).toBe(true);

    // Resolve the request so hooks clean up
    await act(async () => {
      resolvePost(COMMUNITY_RESPONSE);
    });
  });

  it('returns the created community on success', async () => {
    mockFetchOk(COMMUNITY_RESPONSE);

    const { result } = renderHook(() => useCreateCommunity());

    let community: unknown;
    await act(async () => {
      community = await result.current.submit(COMMUNITY_INPUT);
    });

    expect(community).toMatchObject({ id: 'uuid-1', name: 'EcoDAO Lagos' });
  });

  it('POSTs to the authenticated v1 endpoint and revalidates community lists', async () => {
    mockFetchOk(COMMUNITY_RESPONSE);

    const { result } = renderHook(() => useCreateCommunity());

    await act(async () => {
      await result.current.submit(COMMUNITY_INPUT);
    });

    expect(postMock).toHaveBeenCalledWith('/api/v1/communities', COMMUNITY_INPUT);
    expect(mutateMock).toHaveBeenCalledTimes(1);
    const [filter, , options] = mutateMock.mock.calls[0] as [
      (key: unknown) => boolean,
      undefined,
      { revalidate: boolean },
    ];
    expect(filter('http://localhost:4000/api/v1/communities')).toBe(true);
    expect(filter('http://localhost:4000/api/v1/loans')).toBe(false);
    expect(options).toEqual({ revalidate: true });
  });

  it('sets error and rethrows when the API responds with an error', async () => {
    mockFetchError('Name already taken');

    const { result } = renderHook(() => useCreateCommunity());

    await act(async () => {
      await expect(result.current.submit(COMMUNITY_INPUT)).rejects.toThrow('Name already taken');
    });

    expect(result.current.error).toBe('Name already taken');
    expect(result.current.loading).toBe(false);
  });

  it('sets a fallback error message for an unrecognized failure', async () => {
    postMock.mockRejectedValueOnce('unexpected failure');

    const { result } = renderHook(() => useCreateCommunity());

    await act(async () => {
      await expect(result.current.submit(COMMUNITY_INPUT)).rejects.toThrow(
        'Failed to create community'
      );
    });

    expect(result.current.error).toMatch(/failed to create community/i);
  });

  it('sets a fallback error when the request fails (network failure)', async () => {
    postMock.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useCreateCommunity());

    await act(async () => {
      await expect(result.current.submit(COMMUNITY_INPUT)).rejects.toThrow('Network error');
    });

    expect(result.current.error).toBe('Network error');
  });

  it('resets error to null on a subsequent successful call', async () => {
    mockFetchError('Name taken');

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
      await expect(result.current.submit(COMMUNITY_INPUT)).rejects.toThrow('Name taken');
    });

    expect(result.current.error).toBe('Name taken');

    mockFetchOk(COMMUNITY_RESPONSE);

    await act(async () => {
      await result.current.submit(COMMUNITY_INPUT);
    });

    expect(result.current.error).toBeNull();
  });

  it('resets loading to false after the request completes', async () => {
    mockFetchOk(COMMUNITY_RESPONSE);

    const { result } = renderHook(() => useCreateCommunity());

    await act(async () => {
      await result.current.submit(COMMUNITY_INPUT);
    });

    expect(result.current.loading).toBe(false);
  });
});
