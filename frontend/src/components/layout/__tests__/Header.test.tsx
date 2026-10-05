import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from '../Header';
import { useMinWidth } from '@/hooks/useBreakpoint';
import { useWallet } from '@/hooks/useWallet';

jest.mock('@/hooks/useBreakpoint');
jest.mock('@/hooks/useWallet');
jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'light',
    resolvedTheme: 'light',
    systemTheme: 'light',
    setTheme: jest.fn(),
    toggleTheme: jest.fn(),
  }),
}));

const mockState = { pathname: '/dashboard' };

jest.mock('next/navigation', () => ({
  usePathname: () => mockState.pathname,
}));

const mockUseMinWidth = useMinWidth as jest.MockedFunction<typeof useMinWidth>;
const mockUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;

function mockWallet() {
  mockUseWallet.mockReturnValue({
    publicKey: null,
    connected: false,
    connecting: false,
    error: null,
    network: null,
    expectedNetwork: 'TESTNET',
    networkMismatch: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
  } as unknown as ReturnType<typeof useWallet>);
}

describe('Header', () => {
  beforeEach(() => {
    mockWallet();
    mockState.pathname = '/dashboard';
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('renders the brand and primary nav links inline on desktop', () => {
    mockUseMinWidth.mockReturnValue(true);
    mockWallet();
    render(<Header />);

    expect(screen.getByText('CoopLumen')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Communities' })).toBeInTheDocument();
  });

  it('marks the current page link with aria-current', () => {
    mockUseMinWidth.mockReturnValue(true);
    mockWallet();
    mockState.pathname = '/communities';
    render(<Header />);

    expect(screen.getByRole('link', { name: 'Communities' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('does not render a hamburger toggle on desktop', () => {
    mockUseMinWidth.mockReturnValue(true);
    mockWallet();
    render(<Header />);

    expect(screen.queryByRole('button', { name: /open menu/i })).not.toBeInTheDocument();
  });

  it('collapses navigation behind a hamburger toggle below the desktop breakpoint', () => {
    mockUseMinWidth.mockReturnValue(false);
    mockWallet();
    render(<Header />);

    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
  });

  it('opens the mobile menu on toggle click and exposes the nav links', () => {
    mockUseMinWidth.mockReturnValue(false);
    mockWallet();
    render(<Header />);

    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Communities' })).toBeInTheDocument();
  });

  it('closes the mobile menu after a nav link is activated', () => {
    mockUseMinWidth.mockReturnValue(false);
    mockWallet();
    render(<Header />);

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }));

    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Primary' })).not.toBeInTheDocument();
  });

  it('accepts a custom set of nav links', () => {
    mockUseMinWidth.mockReturnValue(true);
    mockWallet();
    render(<Header links={[{ href: '/custom', label: 'Custom' }]} />);

    expect(screen.getByRole('link', { name: 'Custom' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
  });
});
