import { render, screen } from '@testing-library/react';
import CommunityTransactionsPage, { metadata } from './page';
import * as txHook from '@/hooks/useCommunityTransactions';
import * as communityHook from '@/hooks/useCommunities';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/communities/community-42/transactions',
  useSearchParams: () => new URLSearchParams(),
}));

type TxReturn = ReturnType<typeof txHook.useCommunityTransactions>;
type CommunityReturn = ReturnType<typeof communityHook.useCommunity>;

afterEach(() => {
  jest.restoreAllMocks();
});

describe('/communities/[id]/transactions page', () => {
  it('passes the route id through to the transaction history', async () => {
    const spy = jest
      .spyOn(txHook, 'useCommunityTransactions')
      .mockReturnValue({ data: undefined, isLoading: true } as unknown as TxReturn);
    jest
      .spyOn(communityHook, 'useCommunity')
      .mockReturnValue({ data: undefined } as unknown as CommunityReturn);

    render(await CommunityTransactionsPage({ params: Promise.resolve({ id: 'community-42' }) }));

    expect(spy).toHaveBeenCalledWith('community-42', 1);
    expect(screen.getByRole('heading', { level: 1, name: 'Transactions' })).toBeInTheDocument();
  });

  it('sets a page title', () => {
    expect(metadata.title).toBe('Transactions | CoopLumen');
  });
});
