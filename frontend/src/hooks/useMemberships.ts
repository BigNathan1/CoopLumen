import useSWR from 'swr';
import { api, isApiError } from '@/lib/api';
import { memberRoleSchema, type MemberRole } from '@/lib/schemas';
import type { Community } from './useCommunities';

/** One community the connected address belongs to, with its role in it. */
export interface Membership {
  communityId: string;
  communityName: string;
  /** The community token's asset code, so a holding is recognisable. */
  assetCode: string;
  role: MemberRole;
  joinedAt: string;
}

/** Row shape returned by `GET /api/v1/communities/:id/members/:address`. */
interface MemberRecord {
  stellar_address: string;
  role: string;
  joined_at: string;
}

/**
 * Narrows a role that arrived from the API.
 *
 * The column is free text, so an unexpected value must not reach the UI as if
 * it were one of the four roles the app knows about; `member` is the least
 * privileged of them and the API's own default.
 */
function toMemberRole(role: string): MemberRole {
  const parsed = memberRoleSchema.safeParse(role);
  return parsed.success ? parsed.data : 'member';
}

/**
 * Loads every community the address belongs to.
 *
 * The API exposes membership per community rather than per member, so this
 * asks the communities list first and then one membership lookup per
 * community, in parallel. A `404` from a lookup is the answer "not a member",
 * not a failure, and is dropped. Any other error is allowed to reject, because
 * a page that quietly shows an incomplete roster is worse than one that says it
 * could not load and offers a retry.
 */
async function loadMemberships(publicKey: string): Promise<Membership[]> {
  const communities = await api.get<Community[]>('/api/v1/communities');

  const resolved = await Promise.all(
    communities.map(async (community): Promise<Membership | null> => {
      try {
        const member = await api.get<MemberRecord>(
          `/api/v1/communities/${community.id}/members/${publicKey}`
        );

        return {
          communityId: community.id,
          communityName: community.name,
          assetCode: community.asset_code,
          role: toMemberRole(member.role),
          joinedAt: member.joined_at,
        };
      } catch (error) {
        if (isApiError(error) && error.status === 404) return null;
        throw error;
      }
    })
  );

  return resolved.filter((entry): entry is Membership => entry !== null);
}

/**
 * The connected address's community memberships, for the profile overview.
 *
 * Requests nothing while no address is connected, and revalidates on the same
 * cadence as the other member-scoped hooks so a role change shows up without a
 * manual refresh.
 */
export function useMemberships(publicKey: string | null) {
  // The fetcher only runs for a non-null key, so the cast is guarded by the
  // same condition that produces it.
  return useSWR<Membership[]>(
    publicKey ? `memberships:${publicKey}` : null,
    async () => loadMemberships(publicKey as string),
    { refreshInterval: 30_000 }
  );
}
