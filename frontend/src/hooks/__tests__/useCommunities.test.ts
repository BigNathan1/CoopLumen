import { renderHook } from '@testing-library/react';

type CapturedCall = {
  key: string | null;
  fetcher: (url: string) => Promise<unknown>;
};

let lastCall: CapturedCall | undefined;

const swrMock = jest.fn((key: string | null, fetcher: (url: string) => Promise<unknown>) => {
  lastCall = { key, fetcher };
  return { data: undefined, error: undefined, isLoading: false, mutate: jest.fn() };
});

jest.mock('swr', () => ({
  __esModule: true,
  default: (...args: [string | null, (url: string) => Promise<unknown>]) => swrMock(...args),
}));

// Imported after the mock so the hook module picks up the mocked `swr`.
import { useCommunities, useCommunity } from '../useCommunities';

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const fetchMock = jest.fn();

beforeAll(() => {
  (global as { fetch?: unknown }).fetch = fetchMock;
});

afterEach(() => {
  swrMock.mockClear();
  fetchMock.mockReset();
  lastCall = undefined;
});

describe('useCommunities', () => {
  it('requests the base endpoint when called without filters', () => {
    renderHook(() => useCommunities());
    expect(lastCall?.key).toBe('http://localhost:4000/api/v1/communities');
  });

  it('encodes page, limit, and search as query parameters', () => {
    renderHook(() => useCommunities({ page: 2, limit: 10, search: 'solar co-op' }));
    const url = new URL(lastCall?.key as string);
    expect(url.pathname).toBe('/api/v1/communities');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('search')).toBe('solar co-op');
  });

  it('omits parameters that are not provided', () => {
    renderHook(() => useCommunities({ search: 'eco' }));
    const url = new URL(lastCall?.key as string);
    expect(url.searchParams.has('page')).toBe(false);
    expect(url.searchParams.has('limit')).toBe(false);
    expect(url.searchParams.get('search')).toBe('eco');
  });

  it('resolves the unwrapped community list on a successful response', async () => {
    renderHook(() => useCommunities());
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [{ id: 'c1' }] }));

    await expect(lastCall?.fetcher('http://localhost:4000/api/v1/communities')).resolves.toEqual([
      { id: 'c1' },
    ]);
  });

  it('rejects with the API error message on a failed response', async () => {
    renderHook(() => useCommunities());
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'Database unavailable' }));

    await expect(lastCall?.fetcher('http://localhost:4000/api/v1/communities')).rejects.toThrow(
      'Database unavailable'
    );
  });
});

describe('useCommunity', () => {
  it('does not fetch when id is empty', () => {
    renderHook(() => useCommunity(''));
    expect(lastCall?.key).toBeNull();
  });

  it('requests the single-community endpoint for a given id', () => {
    renderHook(() => useCommunity('community-1'));
    expect(lastCall?.key).toBe('http://localhost:4000/api/v1/communities/community-1');
  });

  it('resolves the unwrapped community on a successful response', async () => {
    renderHook(() => useCommunity('community-1'));
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { id: 'community-1', name: 'Eco' } }));

    await expect(
      lastCall?.fetcher('http://localhost:4000/api/v1/communities/community-1')
    ).resolves.toEqual({ id: 'community-1', name: 'Eco' });
  });

  it('rejects with a fallback message when the error body has no message', async () => {
    renderHook(() => useCommunity('missing'));
    fetchMock.mockResolvedValue(jsonResponse(404, {}));

    await expect(
      lastCall?.fetcher('http://localhost:4000/api/v1/communities/missing')
    ).rejects.toThrow('Request failed');
  });
});
