import { fireEvent, render, screen } from '@testing-library/react';
import { CommunityTransactions } from '@/components/CommunityTransactions';
import * as txHook from '@/hooks/useCommunityTransactions';
import * as communityHook from '@/hooks/useCommunities';
import type { TransactionHistoryItem } from '@/components/TransactionHistory';

const push = jest.fn();
let search = '';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/communities/community-1/transactions',
  useSearchParams: () => new URLSearchParams(search),
}));

type TxReturn = ReturnType<typeof txHook.useCommunityTransactions>;
type CommunityReturn = ReturnType<typeof communityHook.useCommunity>;

const item: TransactionHistoryItem = {
  id: 'tx-1',
  hash: 'd'.repeat(64),
  type: 'payment_sent',
  amount: '25.5000000',
  assetCode: 'SOLR',
  date: '2026-03-04T09:30:00.000Z',
  status: 'confirmed',
};

function mockTransactions(value: Partial<TxReturn>) {
  return jest.spyOn(txHook, 'useCommunityTransactions').mockReturnValue(value as TxReturn);
}

function mockCommunity(name: string | undefined) {
  jest
    .spyOn(communityHook, 'useCommunity')
    .mockReturnValue({ data: name ? { name } : undefined } as unknown as CommunityReturn);
}

beforeEach(() => {
  search = '';
  push.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CommunityTransactions', () => {
  it('shows the page heading, the community name, and a way back to the dashboard', () => {
    mockCommunity('Solar Co-op');
    mockTransactions({
      data: { items: [item], meta: { total: 1, page: 1, limit: 20, pages: 1 } },
      isLoading: false,
    });
    render(<CommunityTransactions communityId="community-1" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Transactions' })).toBeInTheDocument();
    expect(screen.getByText('Solar Co-op')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard'
    );
  });

  it('renders the transactions in a table named after the community', () => {
    mockCommunity('Solar Co-op');
    mockTransactions({
      data: { items: [item], meta: { total: 1, page: 1, limit: 20, pages: 1 } },
      isLoading: false,
    });
    render(<CommunityTransactions communityId="community-1" />);

    expect(
      screen.getByRole('table', { name: 'Solar Co-op transaction history' })
    ).toBeInTheDocument();
    expect(screen.getByText('Payment sent')).toBeInTheDocument();
    expect(screen.getByText('1 transaction')).toBeInTheDocument();
  });

  it('uses a generic table name until the community has loaded', () => {
    mockCommunity(undefined);
    mockTransactions({
      data: { items: [item], meta: { total: 1, page: 1, limit: 20, pages: 1 } },
      isLoading: false,
    });
    render(<CommunityTransactions communityId="community-1" />);

    expect(screen.getByRole('table', { name: 'Transaction history' })).toBeInTheDocument();
  });

  it('pluralizes the total and hides pagination when everything fits on one page', () => {
    mockCommunity('Solar Co-op');
    mockTransactions({
      data: {
        items: [item, { ...item, id: 'tx-2' }],
        meta: { total: 2, page: 1, limit: 20, pages: 1 },
      },
      isLoading: false,
    });
    render(<CommunityTransactions communityId="community-1" />);

    expect(screen.getByText('2 transactions')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('shows the loading skeleton while the history loads', () => {
    mockCommunity(undefined);
    mockTransactions({ data: undefined, isLoading: true });
    render(<CommunityTransactions communityId="community-1" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading transactions');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the empty state when the community has no transactions', () => {
    mockCommunity('Solar Co-op');
    mockTransactions({
      data: { items: [], meta: { total: 0, page: 1, limit: 20, pages: 0 } },
      isLoading: false,
    });
    render(<CommunityTransactions communityId="community-1" />);

    expect(screen.getByText(/No transactions yet/)).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ transactions?$/)).not.toBeInTheDocument();
  });

  it('shows the API error message when loading fails', () => {
    mockCommunity(undefined);
    mockTransactions({
      data: undefined,
      isLoading: false,
      error: new Error('Community not found'),
    });
    render(<CommunityTransactions communityId="missing" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Community not found');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('falls back to a generic message when the error has none', () => {
    mockCommunity(undefined);
    mockTransactions({ data: undefined, isLoading: false, error: new Error('') });
    render(<CommunityTransactions communityId="community-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('requests page 1 when the URL has no page', () => {
    mockCommunity('Solar Co-op');
    const spy = mockTransactions({
      data: { items: [item], meta: { total: 45, page: 1, limit: 20, pages: 3 } },
      isLoading: false,
    });
    render(<CommunityTransactions communityId="community-1" />);

    expect(spy).toHaveBeenLastCalledWith('community-1', 1);
  });

  it.each([
    ['page=3', 3],
    ['page=0', 1],
    ['page=-2', 1],
    ['page=abc', 1],
    ['page=2.5', 1],
  ])('reads the page from the URL (%s -> page %i)', (query, expected) => {
    search = query;
    mockCommunity('Solar Co-op');
    const spy = mockTransactions({
      data: { items: [item], meta: { total: 45, page: expected, limit: 20, pages: 3 } },
      isLoading: false,
    });
    render(<CommunityTransactions communityId="community-1" />);

    expect(spy).toHaveBeenLastCalledWith('community-1', expected);
  });

  it('puts the chosen page in the URL so it can be linked to', () => {
    mockCommunity('Solar Co-op');
    mockTransactions({
      data: { items: [item], meta: { total: 45, page: 1, limit: 20, pages: 3 } },
      isLoading: false,
    });
    render(<CommunityTransactions communityId="community-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));

    expect(push).toHaveBeenCalledWith('/communities/community-1/transactions?page=2');
  });

  it('explains when the requested page is past the last page and links back to page 1', () => {
    search = 'page=9';
    mockCommunity('Solar Co-op');
    mockTransactions({
      data: { items: [], meta: { total: 45, page: 9, limit: 20, pages: 3 } },
      isLoading: false,
    });
    render(<CommunityTransactions communityId="community-1" />);

    expect(screen.getByText('That page does not exist')).toBeInTheDocument();
    expect(screen.getByText(/3 pages of transactions/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to the first page' })).toHaveAttribute(
      'href',
      '/communities/community-1/transactions'
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  it('links explorer URLs to the configured network', () => {
    const original = process.env.NEXT_PUBLIC_STELLAR_NETWORK;
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = 'MAINNET';
    mockCommunity(undefined);
    mockTransactions({
      data: { items: [item], meta: { total: 1, page: 1, limit: 20, pages: 1 } },
      isLoading: false,
    });
    render(<CommunityTransactions communityId="community-1" />);

    expect(screen.getByRole('link', { name: /View transaction/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/explorer/mainnet/tx/')
    );

    process.env.NEXT_PUBLIC_STELLAR_NETWORK = original;
  });
});
