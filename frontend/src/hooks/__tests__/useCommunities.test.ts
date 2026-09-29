import { renderHook } from '@testing-library/react';
import {
  useCommunities,
  useCommunity,
  useCommunityMembers,
  type Community,
  type CommunityMember,
} from '../useCommunities';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_COMMUNITY: Community = {
  id: 'uuid-1',
  name: 'EcoDAO',
  description: 'A cooperative',
  asset_code: 'ECO',
  asset_issuer: 'G' + 'A'.repeat(55),
  issuer_public_key: 'G' + 'B'.repeat(55),
  created_at: '2025-01-01T00:00:00.000Z',
};

const MOCK_MEMBERS: CommunityMember[] = [
  {
    id: 'm-1',
    community_id: 'uuid-1',
    stellar_address: 'G' + 'C'.repeat(55),
    role: 'admin',
    joined_at: '2025-01-02T00:00:00.000Z',
  },
  {
    id: 'm-2',
    community_id: 'uuid-1',
    stellar_address: 'G' + 'D'.repeat(55),
    role: 'member',
    joined_at: '2025-03-01T00:00:00.000Z',
  },
];

// ─── SWR mock ─────────────────────────────────────────────────────────────────

type CapturedCall = {
  key: string | null;
  fetcher: (url: string) => Promise<unknown>;
};

let lastCall: CapturedCall | undefined;

const swrMock = jest.fn((key: string | null, fetcher: (url: string) => Promise<unknown>) => {
  lastCall = { key, fetcher };
  return { data: undefined, error: undefined, isLoading: false, mutate: jest.fn() };
});

jest.mock('swr', () => ({
  __esModule: true,
  default: (...args: [string | null, (url: string) => Promise<unknown>]) => swrMock(...args),
  mutate: jest.fn(),
}));

// ─── Fetch mock ───────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const fetchMock = jest.fn();

beforeAll(() => {
  (global as { fetch?: unknown }).fetch = fetchMock;
});

beforeEach(() => {
  swrMock.mockClear();
  fetchMock.mockReset();
  lastCall = undefined;
});

// ─── useCommunities ───────────────────────────────────────────────────────────

describe('useCommunities', () => {
  it('requests the base endpoint when called without filters', () => {
    renderHook(() => useCommunities());
    expect(lastCall?.key).toBe('http://localhost:4000/api/v1/communities');
  });

  it('encodes page, limit, and search as query parameters', () => {
    renderHook(() => useCommunities({ page: 2, limit: 10, search: 'solar co-op' }));
    const url = new URL(lastCall?.key as string);
    expect(url.pathname).toBe('/api/v1/communities');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('search')).toBe('solar co-op');
  });

  it('omits parameters that are not provided', () => {
    renderHook(() => useCommunities({ search: 'eco' }));
    const url = new URL(lastCall?.key as string);
    expect(url.searchParams.has('page')).toBe(false);
    expect(url.searchParams.has('limit')).toBe(false);
    expect(url.searchParams.get('search')).toBe('eco');
  });

  it('resolves the unwrapped community list on a successful response', async () => {
    renderHook(() => useCommunities());
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [{ id: 'c1' }] }));

    await expect(lastCall?.fetcher('http://localhost:4000/api/v1/communities')).resolves.toEqual([
      { id: 'c1' },
    ]);
  });

  it('rejects with the API error message on a failed response', async () => {
    renderHook(() => useCommunities());
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'Database unavailable' }));

    await expect(lastCall?.fetcher('http://localhost:4000/api/v1/communities')).rejects.toThrow(
      'Database unavailable'
    );
  });
});

// ─── useCommunity ─────────────────────────────────────────────────────────────

describe('useCommunity', () => {
  it('does not fetch when id is empty', () => {
    renderHook(() => useCommunity(''));
    expect(lastCall?.key).toBeNull();
  });

  it('requests the single-community endpoint for a given id', () => {
    renderHook(() => useCommunity('community-1'));
    expect(lastCall?.key).toBe('http://localhost:4000/api/v1/communities/community-1');
  });

  it('resolves the unwrapped community on a successful response', async () => {
    renderHook(() => useCommunity('community-1'));
    fetchMock.mockResolvedValue(jsonResponse(200, { data: MOCK_COMMUNITY }));

    await expect(
      lastCall?.fetcher('http://localhost:4000/api/v1/communities/community-1')
    ).resolves.toEqual(MOCK_COMMUNITY);
  });

  it('rejects with a fallback message when the error body has no message', async () => {
    renderHook(() => useCommunity('missing'));
    fetchMock.mockResolvedValue(jsonResponse(404, {}));

    await expect(
      lastCall?.fetcher('http://localhost:4000/api/v1/communities/missing')
    ).rejects.toThrow('Request failed');
  });
});

// ─── useCommunityMembers ──────────────────────────────────────────────────────

describe('useCommunityMembers', () => {
  it('passes a null key when communityId is falsy so SWR skips the fetch', () => {
    renderHook(() => useCommunityMembers(''));
    expect(lastCall?.key).toBeNull();
  });

  it('fires a request to the members endpoint when communityId is provided', () => {
    renderHook(() => useCommunityMembers('uuid-1'));
    expect(lastCall?.key).toMatch(/\/api\/communities\/uuid-1\/members/);
  });

  it('resolves the unwrapped members list on a successful response', async () => {
    renderHook(() => useCommunityMembers('uuid-1'));
    fetchMock.mockResolvedValue(jsonResponse(200, { data: MOCK_MEMBERS }));

    await expect(lastCall?.fetcher(lastCall?.key as string)).resolves.toEqual(MOCK_MEMBERS);
  });

  it('rejects with an error message when the fetch fails', async () => {
    renderHook(() => useCommunityMembers('uuid-1'));
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'Internal server error' }));

    await expect(lastCall?.fetcher(lastCall?.key as string)).rejects.toThrow(
      'Internal server error'
    );
  });

  describe('CommunityMember interface', () => {
    it('has the expected shape fields', () => {
      const member: CommunityMember = MOCK_MEMBERS[0];
      expect(member).toHaveProperty('id');
      expect(member).toHaveProperty('community_id');
      expect(member).toHaveProperty('stellar_address');
      expect(member).toHaveProperty('role');
      expect(member).toHaveProperty('joined_at');
    });

    it('accepts all valid role values', () => {
      const roles: CommunityMember['role'][] = ['admin', 'treasurer', 'member', 'observer'];
      roles.forEach((role) => {
        const m: CommunityMember = { ...MOCK_MEMBERS[0], role };
        expect(m.role).toBe(role);
      });
    });
  });
});
