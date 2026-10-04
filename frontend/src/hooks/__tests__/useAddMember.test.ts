import { act, renderHook } from '@testing-library/react';
import { api } from '@/lib/api';
import { useAddMember } from '../useCommunities';

jest.mock('swr', () => ({
  ...jest.requireActual<object>('swr'),
  mutate: jest.fn().mockResolvedValue(undefined),
}));

const post = jest.spyOn(api, 'post');
const mutate = jest.requireMock('swr').mutate as jest.Mock;
const communityId = 'community-1';
const input = { stellarAddress: `G${'A'.repeat(55)}`, role: 'member' as const };
const member = {
  id: 'member-1',
  community_id: communityId,
  stellar_address: input.stellarAddress,
  role: input.role,
  joined_at: '2026-01-01T00:00:00.000Z',
};

afterEach(() => {
  post.mockReset();
  mutate.mockClear();
});

describe('useAddMember', () => {
  it('posts the member and revalidates the matching list cache', async () => {
    post.mockResolvedValueOnce(member);
    const { result } = renderHook(() => useAddMember(communityId));

    let created;
    await act(async () => {
      created = await result.current.addMember(input);
    });

    expect(created).toEqual(member);
    expect(post).toHaveBeenCalledWith(`/api/v1/communities/${communityId}/members`, input);
    expect(mutate).toHaveBeenCalledWith(`/api/v1/communities/${communityId}/members`);
    expect(result.current.error).toBeNull();
    expect(result.current.submitting).toBe(false);
  });

  it('exposes an API failure without revalidating the list', async () => {
    post.mockRejectedValueOnce(new Error('Admin role required'));
    const { result } = renderHook(() => useAddMember(communityId));

    let created;
    await act(async () => {
      created = await result.current.addMember(input);
    });

    expect(created).toBeNull();
    expect(result.current.error).toBe('Admin role required');
    expect(result.current.submitting).toBe(false);
    expect(mutate).not.toHaveBeenCalled();
  });
});
