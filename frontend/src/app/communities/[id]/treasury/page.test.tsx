import { render, screen } from '@testing-library/react';
import CommunityTreasuryPage, { metadata } from './page';
import * as treasuryHook from '@/hooks/useTreasury';
import * as communityHook from '@/hooks/useCommunities';

type TreasuryReturn = ReturnType<typeof treasuryHook.useTreasury>;
type CommunityReturn = ReturnType<typeof communityHook.useCommunity>;

afterEach(() => {
  jest.restoreAllMocks();
});

describe('/communities/[id]/treasury page', () => {
  it('passes the route id through to the treasury overview', async () => {
    const spy = jest
      .spyOn(treasuryHook, 'useTreasury')
      .mockReturnValue({ data: undefined, isLoading: true } as unknown as TreasuryReturn);
    jest
      .spyOn(communityHook, 'useCommunity')
      .mockReturnValue({ data: undefined } as unknown as CommunityReturn);

    render(await CommunityTreasuryPage({ params: Promise.resolve({ id: 'community-42' }) }));

    expect(spy).toHaveBeenCalledWith('community-42');
    expect(screen.getByRole('heading', { level: 1, name: 'Treasury' })).toBeInTheDocument();
  });

  it('sets a page title', () => {
    expect(metadata.title).toBe('Treasury | CoopLumen');
  });
});
