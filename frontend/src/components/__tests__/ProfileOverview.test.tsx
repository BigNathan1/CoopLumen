import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileOverview } from '../ProfileOverview';
import { useBalances, type Balance } from '@/hooks/useBalances';
import { useMemberships, type Membership } from '@/hooks/useMemberships';
import { useWallet } from '@/hooks/useWallet';

jest.mock('@/hooks/useWallet');
jest.mock('@/hooks/useBalances');
jest.mock('@/hooks/useMemberships');

const mockUseWallet = useWallet as jest.Mock;
const mockUseBalances = useBalances as jest.Mock;
const mockUseMemberships = useMemberships as jest.Mock;

const PUBLIC_KEY = `G${'A'.repeat(55)}`;
const ECO_ISSUER = `G${'B'.repeat(55)}`;

const BALANCES: Balance[] = [
  { asset_type: 'native', balance: '100.0000000' },
  { asset_type: 'credit_alphanum4', asset_code: 'ECO', asset_issuer: ECO_ISSUER, balance: '250.5' },
];

const MEMBERSHIPS: Membership[] = [
  {
    communityId: 'community-1',
    communityName: 'Eco Coop',
    assetCode: 'ECO',
    role: 'admin',
    joinedAt: '2026-01-15T00:00:00.000Z',
  },
  {
    communityId: 'community-2',
    communityName: 'Loan Circle',
    assetCode: 'LOAN',
    role: 'observer',
    joinedAt: '2026-02-01T00:00:00.000Z',
  },
];

function mockWallet(overrides: Partial<ReturnType<typeof useWallet>> = {}) {
  mockUseWallet.mockReturnValue({
    publicKey: null,
    connected: false,
    connecting: false,
    error: null,
    network: null,
    networkPassphrase: null,
    expectedNetwork: 'TESTNET',
    networkMismatch: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    ...overrides,
  });
}

function mockBalances(overrides: Partial<ReturnType<typeof useBalances>> = {}) {
  mockUseBalances.mockReturnValue({
    data: undefined,
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: jest.fn(),
    ...overrides,
  });
}

function mockMemberships(overrides: Partial<ReturnType<typeof useMemberships>> = {}) {
  mockUseMemberships.mockReturnValue({
    data: undefined,
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: jest.fn(),
    ...overrides,
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockWallet();
  mockBalances();
  mockMemberships();
});

describe('ProfileOverview', () => {
  it('prompts to connect when no wallet is connected', async () => {
    const connect = jest.fn();
    mockWallet({ connect });
    render(<ProfileOverview />);

    expect(screen.getByRole('heading', { level: 1, name: 'Your profile' })).toBeInTheDocument();
    expect(screen.getByText('No wallet connected')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('shows the connected address and its network', () => {
    mockWallet({ connected: true, publicKey: PUBLIC_KEY, network: 'TESTNET' });
    mockBalances({ data: [] });
    mockMemberships({ data: [] });
    render(<ProfileOverview />);

    expect(screen.getByTitle(PUBLIC_KEY)).toHaveTextContent('GAAAAA...AAAAAA');
    expect(screen.getByLabelText('Stellar network: TESTNET')).toBeInTheDocument();
  });

  it('announces a network mismatch as an alert', () => {
    mockWallet({
      connected: true,
      publicKey: PUBLIC_KEY,
      network: 'PUBLIC',
      expectedNetwork: 'TESTNET',
      networkMismatch: true,
    });
    mockBalances({ data: [] });
    mockMemberships({ data: [] });
    render(<ProfileOverview />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('CoopLumen expects TESTNET');
  });

  it('lists each balance with its asset code', () => {
    mockWallet({ connected: true, publicKey: PUBLIC_KEY, network: 'TESTNET' });
    mockBalances({ data: BALANCES });
    mockMemberships({ data: [] });
    render(<ProfileOverview />);

    expect(screen.getByText('XLM')).toBeInTheDocument();
    expect(screen.getByText('ECO')).toBeInTheDocument();
  });

  it('lists the communities the member belongs to, with each role', () => {
    mockWallet({ connected: true, publicKey: PUBLIC_KEY, network: 'TESTNET' });
    mockBalances({ data: [] });
    mockMemberships({ data: MEMBERSHIPS });
    render(<ProfileOverview />);

    expect(screen.getByText('Eco Coop')).toBeInTheDocument();
    expect(screen.getByText('Loan Circle')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('observer')).toBeInTheDocument();
  });

  it('announces loading rather than rendering empty content', () => {
    mockWallet({ connected: true, publicKey: PUBLIC_KEY, network: 'TESTNET' });
    mockBalances({ isLoading: true });
    mockMemberships({ isLoading: true });
    render(<ProfileOverview />);

    expect(screen.getByText('Loading balances')).toBeInTheDocument();
    expect(screen.getByText('Loading your communities')).toBeInTheDocument();
  });

  it('offers a retry when the balances fail to load', async () => {
    const mutate = jest.fn();
    mockWallet({ connected: true, publicKey: PUBLIC_KEY, network: 'TESTNET' });
    mockBalances({ error: new Error('boom'), mutate });
    mockMemberships({ data: [] });
    render(<ProfileOverview />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not load your balances.');

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state when the member belongs to no communities', () => {
    mockWallet({ connected: true, publicKey: PUBLIC_KEY, network: 'TESTNET' });
    mockBalances({ data: [] });
    mockMemberships({ data: [] });
    render(<ProfileOverview />);

    expect(screen.getByText('No communities yet')).toBeInTheDocument();
  });

  it('labels the disconnect action so it is never a bare button', () => {
    mockWallet({ connected: true, publicKey: PUBLIC_KEY, network: 'TESTNET' });
    mockBalances({ data: [] });
    mockMemberships({ data: [] });
    render(<ProfileOverview />);

    expect(screen.getByRole('button', { name: 'Disconnect wallet' })).toBeInTheDocument();
  });
});
