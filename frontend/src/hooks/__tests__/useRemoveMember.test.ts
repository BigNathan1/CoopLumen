import { act, renderHook } from '@testing-library/react';
import { api } from '@/lib/api';
import { useRemoveMember } from '../useCommunities';

jest.mock('swr', () => ({
  ...jest.requireActual<object>('swr'),
  mutate: jest.fn().mockResolvedValue(undefined),
}));

const del = jest.spyOn(api, 'delete');
const mutate = jest.requireMock('swr').mutate as jest.Mock;
const communityId = 'community-1';
const address = `G${'A'.repeat(55)}`;

afterEach(() => {
  del.mockReset();
  mutate.mockClear();
});

describe('useRemoveMember', () => {
  it('deletes the member by address and revalidates the member list', async () => {
    del.mockResolvedValueOnce({ stellar_address: address, removed: true });
    const { result } = renderHook(() => useRemoveMember(communityId));

    let removed;
    await act(async () => {
      removed = await result.current.removeMember(address);
    });

    expect(removed).toBe(true);
    expect(del).toHaveBeenCalledWith(`/api/v1/communities/${communityId}/members/${address}`);
    expect(mutate).toHaveBeenCalledWith(`/api/v1/communities/${communityId}/members`);
    expect(result.current.error).toBeNull();
    expect(result.current.submitting).toBe(false);
  });

  it('exposes an API failure without revalidating the list', async () => {
    del.mockRejectedValueOnce(new Error('Admin role required'));
    const { result } = renderHook(() => useRemoveMember(communityId));

    let removed;
    await act(async () => {
      removed = await result.current.removeMember(address);
    });

    expect(removed).toBe(false);
    expect(result.current.error).toBe('Admin role required');
    expect(mutate).not.toHaveBeenCalled();
  });
});
