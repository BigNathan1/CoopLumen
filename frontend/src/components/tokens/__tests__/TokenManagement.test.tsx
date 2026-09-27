import { render, screen } from '@testing-library/react';
import { TokenManagement } from '../TokenManagement';
import { useCommunityTokens } from '@/hooks/useTokens';
import type { Token } from '@/hooks/useTokens';

jest.mock('@/hooks/useTokens');

const mockUseCommunityTokens = useCommunityTokens as jest.MockedFunction<
  typeof useCommunityTokens
>;

const TOKEN: Token = {
  id: 'tok-1',
  community_id: 'comm-1',
  asset_code: 'ECO',
  asset_issuer: 'G' + 'A'.repeat(55),
  distributor_address: 'G' + 'B'.repeat(55),
  total_supply: '1000000',
  name: 'EcoToken',
  description: 'Community currency',
  icon_url: null,
  decimals: 7,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('TokenManagement', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('announces a loading state through a polite status region', () => {
    mockUseCommunityTokens.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useCommunityTokens>);
    render(<TokenManagement communityId="comm-1" />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Loading tokens…');
  });

  it('announces a failure through an alert role', () => {
    mockUseCommunityTokens.mockReturnValue({
      data: undefined,
      error: new Error('network down'),
      isLoading: false,
    } as unknown as ReturnType<typeof useCommunityTokens>);
    render(<TokenManagement communityId="comm-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load tokens');
  });

  it('shows an empty state when there are no tokens', () => {
    mockUseCommunityTokens.mockReturnValue({
      data: [],
      error: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useCommunityTokens>);
    render(<TokenManagement communityId="comm-1" />);

    expect(screen.getByText('No tokens yet')).toBeInTheDocument();
  });

  it('renders a card for each token', () => {
    mockUseCommunityTokens.mockReturnValue({
      data: [TOKEN],
      error: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useCommunityTokens>);
    render(<TokenManagement communityId="comm-1" />);

    expect(screen.getByText('ECO')).toBeInTheDocument();
    expect(screen.getByText('EcoToken')).toBeInTheDocument();
    expect(screen.getByText('1,000,000')).toBeInTheDocument();
  });
});
