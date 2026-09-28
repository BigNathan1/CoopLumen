import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useCommunities, useCommunity } from '../useCommunities';
import { swrConfig } from '../SWRProvider';

const fetchMock = jest.fn();

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeAll(() => {
  (global as { fetch?: unknown }).fetch = fetchMock;
});

afterEach(() => {
  fetchMock.mockReset();
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={swrConfig}>{children}</SWRConfig>
);

describe('useCommunities with global SWR config', () => {
  it('requests the base endpoint when called without filters', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }));

    const { result } = renderHook(() => useCommunities(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/v1/communities');
  });

  it('encodes page, limit, and search as query parameters', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }));

    renderHook(() => useCommunities({ page: 2, limit: 10, search: 'solar co-op' }), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/v1/communities');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('search')).toBe('solar co-op');
  });

  it('omits parameters that are not provided', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }));

    renderHook(() => useCommunities({ search: 'eco' }), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.has('page')).toBe(false);
    expect(url.searchParams.has('limit')).toBe(false);
    expect(url.searchParams.get('search')).toBe('eco');
  });

  it('resolves the unwrapped community list on a successful response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [{ id: 'c1' }] }));

    const { result } = renderHook(() => useCommunities(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'c1' }]));
  });

  it('rejects with the API error message on a failed response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'Database unavailable' }));

    const { result } = renderHook(() => useCommunities(), { wrapper });
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error?.message).toBe('Database unavailable');
  });
});

describe('useCommunity with global SWR config', () => {
  it('does not fetch when id is empty', () => {
    const { result } = renderHook(() => useCommunity(''), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests the single-community endpoint for a given id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { id: 'community-1', name: 'Eco' } }));

    const { result } = renderHook(() => useCommunity('community-1'), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ id: 'community-1', name: 'Eco' }));

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/v1/communities/community-1');
  });

  it('rejects with a fallback message when the error body has no message', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, {}));

    const { result } = renderHook(() => useCommunity('missing'), { wrapper });
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error?.message).toBe('Request failed');
  });
});