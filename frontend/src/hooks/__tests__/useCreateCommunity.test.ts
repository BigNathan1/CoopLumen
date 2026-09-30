import { renderHook, act } from '@testing-library/react';
import { useCreateCommunity } from '@/hooks/useCreateCommunity';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// mutate is a module-level SWR function; stub it so tests don't trigger real
// SWR revalidation cycles.
jest.mock('swr', () => ({
  ...jest.requireActual<object>('swr'),
  mutate: jest.fn().mockResolvedValue(undefined),
}));

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

const fetchMock = jest.fn();

beforeAll(() => {
  (global as { fetch?: unknown }).fetch = fetchMock;
});

afterEach(() => {
  fetchMock.mockReset();
});

function mockFetchOk(data: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ data }),
  });
}

function mockFetchError(status: number, errorMessage: string) {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve({ error: errorMessage }),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useCreateCommunity', () => {
  it('returns initial state with submitting=false and error=null', () => {
    const { result } = renderHook(() => useCreateCommunity());
    expect(result.current.submitting).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.createCommunity).toBe('function');
  });

  it('sets submitting to true while the request is in flight', async () => {
    // Use a promise we control to keep the request "in flight"
    let resolveFetch!: (value: unknown) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const { result } = renderHook(() => useCreateCommunity());

    // Start the call without awaiting
    act(() => {
      void result.current.createCommunity(COMMUNITY_INPUT);
    });

    expect(result.current.submitting).toBe(true);

    // Resolve the fetch so hooks clean up
    await act(async () => {
      resolveFetch({
        ok: true,
        json: () => Promise.resolve({ data: COMMUNITY_RESPONSE }),
      });
    });
  });

  it('returns the created community on success', async () => {
    mockFetchOk(COMMUNITY_RESPONSE);

    const { result } = renderHook(() => useCreateCommunity());

    let community: unknown;
    await act(async () => {
      community = await result.current.createCommunity(COMMUNITY_INPUT);
    });

    expect(community).toMatchObject({ id: 'uuid-1', name: 'EcoDAO Lagos' });
  });

  it('POSTs to /api/communities with the correct body', async () => {
    mockFetchOk(COMMUNITY_RESPONSE);

    const { result } = renderHook(() => useCreateCommunity());

    await act(async () => {
      await result.current.createCommunity(COMMUNITY_INPUT);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/communities$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject(COMMUNITY_INPUT);
  });

  it('sets error and returns null when the API responds with an error', async () => {
    mockFetchError(422, 'Name already taken');

    const { result } = renderHook(() => useCreateCommunity());

    let community: unknown;
    await act(async () => {
      community = await result.current.createCommunity(COMMUNITY_INPUT);
    });

    expect(community).toBeNull();
    expect(result.current.error).toBe('Name already taken');
    expect(result.current.submitting).toBe(false);
  });

  it('sets a fallback error message when the API returns no error string', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => useCreateCommunity());

    await act(async () => {
      await result.current.createCommunity(COMMUNITY_INPUT);
    });

    expect(result.current.error).toMatch(/failed to create community/i);
  });

  it('sets a fallback error when fetch throws (network failure)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useCreateCommunity());

    let community: unknown;
    await act(async () => {
      community = await result.current.createCommunity(COMMUNITY_INPUT);
    });

    expect(community).toBeNull();
    expect(result.current.error).toBe('Network error');
  });

  it('resets error to null on a subsequent successful call', async () => {
    mockFetchError(422, 'Name taken');

    const { result } = renderHook(() => useCreateCommunity());

    await act(async () => {
      await result.current.createCommunity(COMMUNITY_INPUT);
    });

    expect(result.current.error).toBe('Name taken');

    mockFetchOk(COMMUNITY_RESPONSE);

    await act(async () => {
      await result.current.createCommunity(COMMUNITY_INPUT);
    });

    expect(result.current.error).toBeNull();
  });

  it('resets submitting to false after the request completes', async () => {
    mockFetchOk(COMMUNITY_RESPONSE);

    const { result } = renderHook(() => useCreateCommunity());

    await act(async () => {
      await result.current.createCommunity(COMMUNITY_INPUT);
    });

    expect(result.current.submitting).toBe(false);
  });
});
