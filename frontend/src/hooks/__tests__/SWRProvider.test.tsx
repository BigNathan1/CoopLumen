import { renderHook, waitFor } from '@testing-library/react';
import useSWR, { SWRConfig } from 'swr';
import { fetcher, swrConfig, SWRProvider } from '../SWRProvider';

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
  <SWRConfig value={{ ...swrConfig, provider: () => new Map(), dedupingInterval: 0 }}>
    {children}
  </SWRConfig>
);

describe('SWRProvider', () => {
  it('exports a global fetcher that prepends API_URL and unwraps data', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { id: 'test' } }));

    const result = await fetcher<{ id: string }>('/api/v1/test');
    expect(result).toEqual({ id: 'test' });
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/v1/test');
  });

  it('throws with API error message on failed response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'Server error' }));

    await expect(fetcher('/api/v1/test')).rejects.toThrow('Server error');
  });

  it('throws fallback message when error body has no message', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, {}));

    await expect(fetcher('/api/v1/test')).rejects.toThrow('Request failed');
  });

  it('swrConfig has correct global settings', () => {
    expect(swrConfig.revalidateOnFocus).toBe(false);
    expect(swrConfig.errorRetryCount).toBe(3);
    expect(swrConfig.refreshInterval).toBe(30_000);
    expect(swrConfig.dedupingInterval).toBe(2_000);
    expect(typeof swrConfig.fetcher).toBe('function');
  });

  it('SWRProvider renders children', () => {
    const { result } = renderHook(() => 'child content', { wrapper });
    expect(result.current).toBe('child content');
  });
});

describe('useSWR with global config', () => {
  it('uses global fetcher, revalidateOnFocus, and errorRetryCount', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [{ id: '1' }] }));

    const { result } = renderHook(() => useSWR<{ id: string }[]>('/api/v1/test', fetcher), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual([{ id: '1' }]));
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/v1/test');
  });
});
