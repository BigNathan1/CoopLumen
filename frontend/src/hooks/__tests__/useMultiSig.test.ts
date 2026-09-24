import { renderHook, act } from '@testing-library/react';
import { useMultiSig } from '../useMultiSig';
import type { MultiSigRequest } from '../useMultiSig';

const mockMutate = jest.fn();

jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string | null, fetcher: (url: string) => Promise<unknown>) => {
    if (!key) {
      return { data: undefined, error: undefined, isLoading: false, mutate: mockMutate };
    }
    return {
      data: [
        {
          id: 'req-1',
          community_id: 'comm-1',
          proposer_address: 'G' + 'A'.repeat(55),
          action: 'payment',
          title: 'Test Proposal',
          description: 'A test proposal',
          payload: { amount: '100' },
          transaction_xdr: null,
          required_signatures: 2,
          current_signatures: 1,
          status: 'pending',
          stellar_tx_hash: null,
          rejection_reason: null,
          expires_at: null,
          executed_at: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        } as MultiSigRequest,
      ],
      error: undefined,
      isLoading: false,
      mutate: mockMutate,
    };
  },
}));

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

const fetchMock = jest.fn();

beforeAll(() => {
  (global as { fetch?: unknown }).fetch = fetchMock;
});

afterEach(() => {
  fetchMock.mockReset();
  mockMutate.mockClear();
});

describe('useMultiSig', () => {
  it('returns empty requests array when communityId is null', () => {
    const { result } = renderHook(() => useMultiSig(null));
    expect(result.current.requests).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('returns data when communityId is provided', () => {
    const { result } = renderHook(() => useMultiSig('comm-1'));
    expect(result.current.requests).toHaveLength(1);
    expect(result.current.requests[0].title).toBe('Test Proposal');
  });

  it('creates a new multisig request', async () => {
    const newReq: Partial<MultiSigRequest> = {
      id: 'req-2',
      community_id: 'comm-1',
      title: 'New Proposal',
      action: 'payment',
      status: 'pending',
    };
    fetchMock.mockResolvedValue(jsonResponse(200, { data: newReq }));

    const { result } = renderHook(() => useMultiSig('comm-1'));

    let created: MultiSigRequest | undefined;
    await act(async () => {
      created = await result.current.createRequest({
        title: 'New Proposal',
        action: 'payment',
        proposer_address: 'G' + 'A'.repeat(55),
      });
    });

    expect(created).toEqual(newReq);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/v1/multisig/community/comm-1');
    expect(options).toMatchObject({ method: 'POST' });
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it('approves a multisig request', async () => {
    const updatedReq: Partial<MultiSigRequest> = { id: 'req-1', status: 'approved' };
    fetchMock.mockResolvedValue(jsonResponse(200, { data: updatedReq }));

    const { result } = renderHook(() => useMultiSig('comm-1'));

    await act(async () => {
      await result.current.approveRequest('req-1', 'AAAA_XDR');
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/v1/multisig/requests/req-1/approve');
    expect(JSON.parse((options as RequestInit).body as string)).toEqual({ signed_xdr: 'AAAA_XDR' });
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it('rejects a multisig request', async () => {
    const updatedReq: Partial<MultiSigRequest> = { id: 'req-1', status: 'rejected' };
    fetchMock.mockResolvedValue(jsonResponse(200, { data: updatedReq }));

    const { result } = renderHook(() => useMultiSig('comm-1'));

    await act(async () => {
      await result.current.rejectRequest('req-1', 'Invalid terms');
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/v1/multisig/requests/req-1/reject');
    expect(JSON.parse((options as RequestInit).body as string)).toEqual({ reason: 'Invalid terms' });
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it('executes a multisig request', async () => {
    const updatedReq: Partial<MultiSigRequest> = { id: 'req-1', status: 'executed' };
    fetchMock.mockResolvedValue(jsonResponse(200, { data: updatedReq }));

    const { result } = renderHook(() => useMultiSig('comm-1'));

    await act(async () => {
      await result.current.executeRequest('req-1', 'tx_hash_123');
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/v1/multisig/requests/req-1/execute');
    expect(JSON.parse((options as RequestInit).body as string)).toEqual({ stellar_tx_hash: 'tx_hash_123' });
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });
});
