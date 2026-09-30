import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { api, isApiError } from '@/lib/api';
import { useMemberships } from '../useMemberships';

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
  },
  isApiError: (value: unknown) => value instanceof Error && 'status' in value,
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  );
}

const PUBLIC_KEY = 'G' + 'A'.repeat(55);
const apiGetMock = api.get as jest.Mock;

const communityOne = {
  id: 'community-1',
  name: 'Alpha Co-op',
  description: null,
  asset_code: 'ALPHA',
  asset_issuer: 'G' + 'C'.repeat(55),
  issuer_public_key: 'G' + 'D'.repeat(55),
  created_at: '2026-01-01T00:00:00.000Z',
};

const communityTwo = {
  id: 'community-2',
  name: 'Beta Co-op',
  description: 'Community two',
  asset_code: 'BETA',
  asset_issuer: 'G' + 'E'.repeat(55),
  issuer_public_key: 'G' + 'F'.repeat(55),
  created_at: '2026-01-02T00:00:00.000Z',
};

describe('useMemberships', () => {
  beforeEach(() => {
    apiGetMock.mockReset();
  });

  it('loads the communities a public key belongs to', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/v1/communities') return [communityOne, communityTwo];
      if (path === `/api/v1/communities/${communityOne.id}/members/${PUBLIC_KEY}`) {
        return {
          stellar_address: PUBLIC_KEY,
          role: 'treasurer',
          joined_at: '2026-02-01T00:00:00.000Z',
        };
      }
      if (path === `/api/v1/communities/${communityTwo.id}/members/${PUBLIC_KEY}`) {
        const error = new Error('Not found') as Error & { status: number };
        error.status = 404;
        throw error;
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    const { result } = renderHook(() => useMemberships(PUBLIC_KEY), { wrapper });

    await waitFor(() =>
      expect(result.current.data).toEqual([
        {
          communityId: communityOne.id,
          communityName: communityOne.name,
          assetCode: communityOne.asset_code,
          role: 'treasurer',
          joinedAt: '2026-02-01T00:00:00.000Z',
        },
      ])
    );
  });

  it('does not fetch when the public key is missing', () => {
    renderHook(() => useMemberships(null), { wrapper });
    expect(apiGetMock).not.toHaveBeenCalled();
  });

  it('surfaces a non-404 membership failure', async () => {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/api/v1/communities') return [communityOne];
      const error = new Error('Server exploded') as Error & { status: number };
      error.status = 500;
      throw error;
    });

    const { result } = renderHook(() => useMemberships(PUBLIC_KEY), { wrapper });

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.data).toBeUndefined();
    expect(isApiError(result.current.error)).toBe(true);
  });
});
