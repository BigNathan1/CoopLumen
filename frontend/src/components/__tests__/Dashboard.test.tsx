import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from '../Dashboard';
import { useCommunities, type Community } from '@/hooks/useCommunities';
import { useWallet } from '@/hooks/useWallet';

jest.mock('@/hooks/useCommunities');
jest.mock('@/hooks/useWallet');

jest.mock('../ThemeToggle', () => ({
  ThemeToggle: () => <button type="button">Toggle theme</button>,
}));

jest.mock('../WalletConnect', () => ({
  WalletConnect: () => <div data-testid="wallet-connect" />,
}));

jest.mock('../BalancePanel', () => ({
  BalancePanel: ({ publicKey }: { publicKey: string }) => (
    <div data-testid="balance-panel">{publicKey}</div>
  ),
}));

const mockUseCommunities = useCommunities as jest.Mock;
const mockUseWallet = useWallet as jest.Mock;

const COMMUNITY: Community = {
  id: '1',
  name: 'Eco Coop',
  description: 'A community for eco projects',
  asset_code: 'ECO',
  asset_issuer: 'GISSUERISSUERISSUERISSUERISSUERISSUERISSUERISSUERISSXX',
  issuer_public_key: 'GISSUERISSUERISSUERISSUERISSUERISSUERISSUERISSUERISSXX',
  created_at: '2026-01-01T00:00:00.000Z',
};

function mockCommunities(overrides: Partial<ReturnType<typeof useCommunities>> = {}) {
  mockUseCommunities.mockReturnValue({
    data: undefined,
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: jest.fn(),
    ...overrides,
  });
}

function mockWallet(overrides: Partial<ReturnType<typeof useWallet>> = {}) {
  mockUseWallet.mockReturnValue({
    publicKey: null,
    connected: false,
    connecting: false,
    error: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    ...overrides,
  });
}

describe('Dashboard', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockWallet();
  });

  it('renders the wallet connect and theme toggle controls', () => {
    mockCommunities({ data: [] });
    render(<Dashboard />);

    expect(screen.getByTestId('wallet-connect')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument();
  });

  it('shows a loading skeleton, announced once, while communities are loading', () => {
    mockCommunities({ isLoading: true });
    render(<Dashboard />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading communities');
    expect(screen.queryByRole('heading', { name: 'Eco Coop' })).not.toBeInTheDocument();
  });

  it('renders the community grid once loaded', () => {
    mockCommunities({ data: [COMMUNITY] });
    render(<Dashboard />);

    expect(screen.getByText('1 registered')).toBeInTheDocument();
    // The name also appears in the loans filter's community dropdown, so match
    // the card's heading specifically.
    expect(screen.getByRole('heading', { name: 'Eco Coop' })).toBeInTheDocument();
  });

  it('shows an accessible error state with a working retry action', async () => {
    const mutate = jest.fn();
    mockCommunities({ error: new Error('boom'), mutate });
    render(<Dashboard />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not load communities. Is the API running?');

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state with a link to create the first community', () => {
    mockCommunities({ data: [] });
    render(<Dashboard />);

    expect(screen.getByText(/No communities yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create the first one' })).toBeInTheDocument();
  });

  it('hides the balance sidebar when the wallet is disconnected', () => {
    mockCommunities({ data: [] });
    render(<Dashboard />);

    expect(screen.queryByTestId('balance-panel')).not.toBeInTheDocument();
  });

  it('shows the balance sidebar with the connected public key', () => {
    mockCommunities({ data: [] });
    mockWallet({
      connected: true,
      publicKey: 'GUSERPUBLICKEYGUSERPUBLICKEYGUSERPUBLICKEYGUSERPUBLI',
    });
    render(<Dashboard />);

    expect(screen.getByTestId('balance-panel')).toHaveTextContent(
      'GUSERPUBLICKEYGUSERPUBLICKEYGUSERPUBLICKEYGUSERPUBLI'
    );
  });
});
