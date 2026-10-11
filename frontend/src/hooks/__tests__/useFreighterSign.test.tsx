import { renderHook, act } from '@testing-library/react';
import { isConnected, isAllowed, signTransaction } from '@stellar/freighter-api';
import { useFreighterSign } from '../useFreighterSign';

jest.mock('@stellar/freighter-api', () => ({
  isConnected: jest.fn(),
  isAllowed: jest.fn(),
  signTransaction: jest.fn(),
}));

describe('useFreighterSign', () => {
  const mockIsConnected = isConnected as jest.Mock;
  const mockIsAllowed = isAllowed as jest.Mock;
  const mockSignTransaction = signTransaction as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsConnected.mockResolvedValue({ isConnected: true });
    mockIsAllowed.mockResolvedValue({ isAllowed: true });
  });

  it('signs successfully when provided an XDR string', async () => {
    const rawXdr = 'AAAA_RAW_XDR_...';
    const signedXdr = 'AAAA_SIGNED_XDR_...';
    mockSignTransaction.mockResolvedValueOnce({ signedTxXdr: signedXdr, signerAddress: 'G...' });

    const { result } = renderHook(() => useFreighterSign(rawXdr));

    let returnedXdr;
    await act(async () => {
      returnedXdr = await result.current.sign();
    });

    expect(mockSignTransaction).toHaveBeenCalledWith(rawXdr, {
      networkPassphrase: 'Test SDF Network ; September 2015',
    });
    expect(returnedXdr).toBe(signedXdr);
    expect(result.current.error).toBeNull();
    expect(result.current.isSigning).toBe(false);
  });

  it('throws an error if Freighter is not connected', async () => {
    mockIsConnected.mockResolvedValueOnce({ isConnected: false });

    const { result } = renderHook(() => useFreighterSign('some-xdr'));

    await act(async () => {
      await expect(result.current.sign()).rejects.toThrow(
        'Freighter is not connected or installed.'
      );
    });
    expect(result.current.error?.message).toBe('Freighter is not connected or installed.');
    expect(result.current.isSigning).toBe(false);
  });

  it('throws an error if Freighter is not authorized', async () => {
    mockIsAllowed.mockResolvedValueOnce({ isAllowed: false });

    const { result } = renderHook(() => useFreighterSign('some-xdr'));

    await act(async () => {
      await expect(result.current.sign()).rejects.toThrow(
        'Freighter is not authorized for this application.'
      );
    });
    expect(result.current.error?.message).toBe('Freighter is not authorized for this application.');
  });

  it('throws an error if no XDR is provided', async () => {
    const { result } = renderHook(() => useFreighterSign());

    await act(async () => {
      await expect(result.current.sign()).rejects.toThrow('No XDR provided for signing.');
    });
  });

  it('handles user rejection or signing failure from Freighter', async () => {
    mockSignTransaction.mockResolvedValueOnce({
      signedTxXdr: '',
      signerAddress: '',
      error: { code: -1, message: 'User declined the transaction' },
    });

    const { result } = renderHook(() => useFreighterSign('some-xdr'));

    await act(async () => {
      await expect(result.current.sign()).rejects.toThrow('User declined the transaction');
    });
    expect(result.current.error?.message).toBe('User declined the transaction');
    expect(result.current.isSigning).toBe(false);
  });
});
