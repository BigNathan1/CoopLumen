import { render, screen, within } from '@testing-library/react';
import { TreasuryOverview } from '@/components/treasury/TreasuryOverview';
import * as treasuryHook from '@/hooks/useTreasury';
import * as communityHook from '@/hooks/useCommunities';

type TreasuryReturn = ReturnType<typeof treasuryHook.useTreasury>;
type CommunityReturn = ReturnType<typeof communityHook.useCommunity>;

const ACCOUNT = 'G' + 'A'.repeat(55);
const ISSUER = 'G' + 'B'.repeat(55);

const treasury = {
  account: ACCOUNT,
  balances: [
    {
      asset_type: 'credit_alphanum4',
      asset_code: 'SOLR',
      asset_issuer: ISSUER,
      balance: '5000.50',
    },
    { asset_type: 'native', balance: '1234.5678900' },
  ],
};

function mockTreasury(value: Partial<TreasuryReturn>) {
  return jest.spyOn(treasuryHook, 'useTreasury').mockReturnValue(value as TreasuryReturn);
}

function mockCommunity(name: string | undefined) {
  jest
    .spyOn(communityHook, 'useCommunity')
    .mockReturnValue({ data: name ? { name } : undefined } as unknown as CommunityReturn);
}

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.NEXT_PUBLIC_STELLAR_NETWORK;
});

describe('TreasuryOverview', () => {
  it('shows the heading, the community name, and a way back to the dashboard', () => {
    mockCommunity('Solar Co-op');
    mockTreasury({ data: treasury, isLoading: false });
    render(<TreasuryOverview communityId="community-1" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Treasury' })).toBeInTheDocument();
    expect(screen.getByText('Solar Co-op')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard'
    );
  });

  it('requests the treasury of the given community', () => {
    mockCommunity(undefined);
    const spy = mockTreasury({ data: treasury, isLoading: false });
    render(<TreasuryOverview communityId="community-1" />);

    expect(spy).toHaveBeenCalledWith('community-1');
  });

  it('shows the treasury account with copy and explorer actions', () => {
    mockCommunity(undefined);
    mockTreasury({ data: treasury, isLoading: false });
    render(<TreasuryOverview communityId="community-1" />);

    const section = screen.getByRole('region', { name: 'Treasury account' });
    expect(within(section).getByTitle(ACCOUNT)).toHaveTextContent('GAAAAAAAAA...AAAAAAAAAA');
    expect(
      within(section).getByRole('button', { name: 'Copy Stellar address' })
    ).toBeInTheDocument();
    expect(within(section).getByRole('link')).toHaveAttribute(
      'href',
      `https://stellar.expert/explorer/testnet/account/${ACCOUNT}`
    );
  });

  it('links the explorer to mainnet when the app is configured for it', () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = 'MAINNET';
    mockCommunity(undefined);
    mockTreasury({ data: treasury, isLoading: false });
    render(<TreasuryOverview communityId="community-1" />);

    const section = screen.getByRole('region', { name: 'Treasury account' });
    expect(within(section).getByRole('link')).toHaveAttribute(
      'href',
      expect.stringContaining('/explorer/mainnet/account/')
    );
  });

  it('lists balances with XLM first, marked as native, then issued assets under their issuer', () => {
    mockCommunity(undefined);
    mockTreasury({ data: treasury, isLoading: false });
    render(<TreasuryOverview communityId="community-1" />);

    const table = screen.getByRole('table', { name: 'Treasury balances' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent)
    ).toEqual(['Asset', 'Balance']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);

    expect(rows[0]).toHaveTextContent('XLM');
    expect(rows[0]).toHaveTextContent('Native');
    expect(rows[0]).toHaveTextContent('No issuer, native asset');
    expect(rows[1]).toHaveTextContent('SOLR');
    expect(within(rows[1]).getByTitle(ISSUER)).toHaveTextContent('Issuer: GBBBBB...BBBBBB');
    expect(screen.getByText('2 assets')).toBeInTheDocument();
  });

  it('formats balances like the wallet panel, with 2 to 7 decimals', () => {
    mockCommunity(undefined);
    mockTreasury({ data: treasury, isLoading: false });
    render(<TreasuryOverview communityId="community-1" />);

    expect(screen.getByText('1,234.56789')).toBeInTheDocument();
    expect(screen.getByText('5,000.50')).toBeInTheDocument();
  });

  it('labels an asset without a code instead of leaving it blank', () => {
    mockCommunity(undefined);
    mockTreasury({
      data: { account: ACCOUNT, balances: [{ asset_type: 'credit_alphanum4', balance: '1' }] },
      isLoading: false,
    });
    render(<TreasuryOverview communityId="community-1" />);

    expect(screen.getByText('Unknown asset')).toBeInTheDocument();
  });

  it('singularizes the asset count', () => {
    mockCommunity(undefined);
    mockTreasury({
      data: { account: ACCOUNT, balances: [{ asset_type: 'native', balance: '10' }] },
      isLoading: false,
    });
    render(<TreasuryOverview communityId="community-1" />);

    expect(screen.getByText('1 asset')).toBeInTheDocument();
  });

  it('keeps unparseable balances readable instead of showing NaN', () => {
    mockCommunity(undefined);
    mockTreasury({
      data: { account: ACCOUNT, balances: [{ asset_type: 'native', balance: 'n/a' }] },
      isLoading: false,
    });
    render(<TreasuryOverview communityId="community-1" />);

    expect(screen.getByText('n/a')).toBeInTheDocument();
    expect(screen.queryByText('NaN')).not.toBeInTheDocument();
  });

  it('shows an empty state when the account holds no assets', () => {
    mockCommunity(undefined);
    mockTreasury({ data: { account: ACCOUNT, balances: [] }, isLoading: false });
    render(<TreasuryOverview communityId="community-1" />);

    expect(screen.getByText('This treasury account holds no assets yet.')).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ assets?$/)).not.toBeInTheDocument();
  });

  it('shows an accessible loading skeleton while the treasury loads', () => {
    mockCommunity(undefined);
    mockTreasury({ data: undefined, isLoading: true });
    render(<TreasuryOverview communityId="community-1" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading treasury');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the API error message when loading fails', () => {
    mockCommunity(undefined);
    mockTreasury({ data: undefined, isLoading: false, error: new Error('Community not found') });
    render(<TreasuryOverview communityId="missing" />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not load the treasury');
    expect(alert).toHaveTextContent('Community not found');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('falls back to a generic message when the error has none', () => {
    mockCommunity(undefined);
    mockTreasury({ data: undefined, isLoading: false, error: new Error('') });
    render(<TreasuryOverview communityId="community-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });
});
