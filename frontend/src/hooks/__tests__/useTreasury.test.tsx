import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { api, ApiError } from '@/lib/api';
import { sortBalances, useTreasury } from '../useTreasury';
import type { Balance } from '../useBalances';

const ISSUER_A = 'G' + 'A'.repeat(55);
const ISSUER_B = 'G' + 'B'.repeat(55);

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('sortBalances', () => {
  const native: Balance = { asset_type: 'native', balance: '100.0000000' };
  const coop: Balance = {
    asset_type: 'credit_alphanum4',
    asset_code: 'COOP',
    asset_issuer: ISSUER_A,
    balance: '5000.00',
  };
  const solr: Balance = {
    asset_type: 'credit_alphanum4',
    asset_code: 'SOLR',
    asset_issuer: ISSUER_A,
    balance: '10',
  };

  it('puts the native balance first and orders issued assets by code', () => {
    expect(sortBalances([solr, native, coop])).toEqual([native, coop, solr]);
  });

  it('breaks ties between the same code by issuer', () => {
    const other = { ...coop, asset_issuer: ISSUER_B };

    expect(sortBalances([other, coop])).toEqual([coop, other]);
  });

  it('does not mutate its input', () => {
    const input = [solr, native];
    sortBalances(input);

    expect(input).toEqual([solr, native]);
  });

  it('handles an empty list', () => {
    expect(sortBalances([])).toEqual([]);
  });
});

describe('useTreasury', () => {
  it('requests the community treasury and returns the payload', async () => {
    const payload = {
      account: ISSUER_A,
      balances: [{ asset_type: 'native', balance: '100.0000000' }],
    };
    const get = jest.spyOn(api, 'get').mockResolvedValue(payload);

    const { result } = renderHook(() => useTreasury('community-1'), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(payload));
    expect(get).toHaveBeenCalledWith('/api/v1/communities/community-1/treasury', { auth: false });
  });

  it('encodes the community id in the request path', async () => {
    const get = jest.spyOn(api, 'get').mockResolvedValue({ account: ISSUER_A, balances: [] });

    renderHook(() => useTreasury('a/b c'), { wrapper });

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(get.mock.calls[0][0]).toBe('/api/v1/communities/a%2Fb%20c/treasury');
  });

  it('does not fetch without a community id', () => {
    const get = jest.spyOn(api, 'get');

    const { result } = renderHook(() => useTreasury(''), { wrapper });

    expect(get).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it('surfaces API errors', async () => {
    jest.spyOn(api, 'get').mockRejectedValue(new ApiError('Community not found', { status: 404 }));

    const { result } = renderHook(() => useTreasury('missing'), { wrapper });

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error?.message).toBe('Community not found');
  });
});
