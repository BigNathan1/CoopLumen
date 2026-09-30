import { act, renderHook } from '@testing-library/react';
import { api } from '@/lib/api';
import { useTransferToken } from '../useTransferToken';

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
  senderPublicKey: `G${'A'.repeat(55)}`,
  destinationPublicKey: `G${'B'.repeat(55)}`,
  assetCode: 'ECO',
  assetIssuer: `G${'C'.repeat(55)}`,
  amount: '25',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSignTransaction.mockResolvedValue('signed-xdr');
  post.mockImplementation(async (path: string) => {
    if (path === '/api/v1/transactions/unsigned') return { xdr: 'unsigned-xdr' };
    if (path === '/api/v1/tokens/transfer') return { txHash: 'transaction-hash' };
    throw new Error(`Unexpected request to ${path}`);
  });
});

describe('useTransferToken', () => {
  it('builds, signs, and submits a payment, then refreshes both balances', async () => {
    const { result } = renderHook(() => useTransferToken());
    const onProgress = jest.fn();
    let txHash: string | undefined;

    await act(async () => {
      txHash = await result.current.submit(input, onProgress);
    });

    expect(txHash).toBe('transaction-hash');
    expect(post).toHaveBeenNthCalledWith(1, '/api/v1/transactions/unsigned', input);
    expect(mockSignTransaction).toHaveBeenCalledWith('unsigned-xdr');
    expect(post).toHaveBeenNthCalledWith(2, '/api/v1/tokens/transfer', {
      signedXdr: 'signed-xdr',
    });
    expect(mutate).toHaveBeenCalledTimes(1);
    const [filter, , options] = mutate.mock.calls[0] as [
      (key: unknown) => boolean,
      undefined,
      { revalidate: boolean },
    ];
    expect(filter(`http://localhost:4000/api/v1/balances/${input.senderPublicKey}`)).toBe(true);
    expect(filter(`http://localhost:4000/api/v1/balances/${input.destinationPublicKey}`)).toBe(
      true
    );
    expect(filter('http://localhost:4000/api/v1/balances/other')).toBe(false);
    expect(options).toEqual({ revalidate: true });
    expect(onProgress).toHaveBeenNthCalledWith(1, 'Building the transfer…');
    expect(onProgress).toHaveBeenNthCalledWith(2, 'Approve the transfer in your wallet…');
    expect(onProgress).toHaveBeenNthCalledWith(3, 'Submitting the signed transfer…');
    expect(onProgress).toHaveBeenLastCalledWith(null);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('does not submit or refresh balances when Freighter rejects signing', async () => {
    mockSignTransaction.mockRejectedValueOnce(new Error('User declined to sign'));
    const { result } = renderHook(() => useTransferToken());

    await act(async () => {
      await expect(result.current.submit(input)).rejects.toThrow('User declined to sign');
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(mutate).not.toHaveBeenCalled();
    expect(result.current.error).toBe('User declined to sign');
    expect(result.current.loading).toBe(false);
  });

  it('does not open Freighter when building the unsigned transaction fails', async () => {
    post.mockRejectedValueOnce(new Error('Source account not found.'));
    const { result } = renderHook(() => useTransferToken());

    await act(async () => {
      await expect(result.current.submit(input)).rejects.toThrow('Source account not found.');
    });

    expect(mockSignTransaction).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledTimes(1);
    expect(mutate).not.toHaveBeenCalled();
  });
});
