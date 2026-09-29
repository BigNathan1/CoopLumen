import { act, renderHook } from '@testing-library/react';
import { api } from '@/lib/api';
import { useIssueToken } from '../useIssueToken';

const mockSignTransaction = jest.fn<Promise<string>, [string]>();

jest.mock('@stellar/freighter-api', () => ({
  signTransaction: (...args: unknown[]) => mockSignTransaction(...(args as [string])),
}));
jest.mock('swr', () => ({
  ...jest.requireActual<object>('swr'),
  mutate: jest.fn().mockResolvedValue(undefined),
}));

const post = jest.spyOn(api, 'post');
const mutate = jest.requireMock('swr').mutate as jest.Mock;

const input = {
  issuerPublicKey: `G${'A'.repeat(55)}`,
  assetCode: 'ECO',
  distributorPublicKey: `G${'B'.repeat(55)}`,
  amount: '100',
  memo: 'Community token issuance',
  communityId: 'community-1',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSignTransaction.mockResolvedValue('signed-xdr');
  post.mockImplementation(async (path: string) => {
    if (path === '/api/v1/tokens/build-issue') return { xdr: 'unsigned-xdr' };
    if (path === '/api/v1/tokens/submit') return { txHash: 'transaction-hash' };
    throw new Error(`Unexpected request to ${path}`);
  });
});

describe('useIssueToken', () => {
  it('builds, signs, submits, and refreshes the affected SWR entries', async () => {
    const { result } = renderHook(() => useIssueToken());
    let txHash: string | undefined;

    await act(async () => {
      txHash = await result.current.submit(input);
    });

    expect(txHash).toBe('transaction-hash');
    const { communityId, ...buildInput } = input;
    expect(post).toHaveBeenNthCalledWith(1, '/api/v1/tokens/build-issue', buildInput);
    expect(mockSignTransaction).toHaveBeenCalledWith('unsigned-xdr');
    expect(post).toHaveBeenNthCalledWith(2, '/api/v1/tokens/submit', {
      signedXdr: 'signed-xdr',
    });

    expect(mutate).toHaveBeenCalledTimes(1);
    const [filter, , options] = mutate.mock.calls[0] as [
      (key: unknown) => boolean,
      undefined,
      { revalidate: boolean }
    ];
    expect(filter(`http://localhost:4000/api/v1/balances/${input.issuerPublicKey}`)).toBe(true);
    expect(filter(`http://localhost:4000/api/v1/balances/${input.distributorPublicKey}`)).toBe(true);
    expect(filter(`http://localhost:4000/api/v1/tokens/${communityId}`)).toBe(true);
    expect(filter('http://localhost:4000/api/v1/tokens/community-2')).toBe(false);
    expect(options).toEqual({ revalidate: true });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('does not submit when the issuer rejects the Freighter signature', async () => {
    mockSignTransaction.mockRejectedValueOnce(new Error('User declined to sign'));
    const { result } = renderHook(() => useIssueToken());

    await act(async () => {
      await expect(result.current.submit(input)).rejects.toThrow('User declined to sign');
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(mutate).not.toHaveBeenCalled();
    expect(result.current.error).toBe('User declined to sign');
    expect(result.current.loading).toBe(false);
  });

  it('does not ask Freighter to sign if building the transaction fails', async () => {
    post.mockRejectedValueOnce(new Error('Issuer account not funded.'));
    const { result } = renderHook(() => useIssueToken());

    await act(async () => {
      await expect(result.current.submit(input)).rejects.toThrow('Issuer account not funded.');
    });

    expect(mockSignTransaction).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledTimes(1);
    expect(mutate).not.toHaveBeenCalled();
  });
});