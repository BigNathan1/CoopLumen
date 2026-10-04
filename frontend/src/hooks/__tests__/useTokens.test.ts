import { renderHook } from '@testing-library/react';
import { useCommunityTokens } from '../useTokens';
import type { Token } from '../useTokens';

const TOKEN: Token = {
  id: 'tok-1',
  community_id: 'comm-1',
  asset_code: 'ECO',
  asset_issuer: 'G' + 'A'.repeat(55),
  distributor_address: 'G' + 'B'.repeat(55),
  total_supply: '1000000',
  name: 'EcoToken',
  description: 'Community currency',
  icon_url: null,
  decimals: 7,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

jest.mock('swr', () => ({
  __esModule: true,
  default: (key: string | null) => {
    if (!key) {
      return { data: undefined, error: undefined, isLoading: false };
    }
    return { data: [TOKEN], error: undefined, isLoading: false };
  },
}));

describe('useCommunityTokens', () => {
  it('does not fetch when communityId is null', () => {
    const { result } = renderHook(() => useCommunityTokens(null));
    expect(result.current.data).toBeUndefined();
  });

  it('returns tokens for a community', () => {
    const { result } = renderHook(() => useCommunityTokens('comm-1'));
    expect(result.current.data).toEqual([TOKEN]);
  });
});
