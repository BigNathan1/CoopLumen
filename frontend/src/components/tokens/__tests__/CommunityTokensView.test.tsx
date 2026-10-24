import { render, screen } from '@testing-library/react';
import { CommunityTokensView } from '@/components/tokens/CommunityTokensView';

const COMMUNITY_ID = '123e4567-e89b-12d3-a456-426614174000';
const mockCommunity = {
  id: COMMUNITY_ID,
  name: 'Tech Cooperative',
  description: 'A cooperative for tech workers',
  location: 'San Francisco',
  treasury_address: 'G' + 'A'.repeat(55),
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

// Mock the useCommunity hook
interface MockCommunityResult {
  data: (Omit<typeof mockCommunity, 'name'> & { name: string | null }) | null;
  error: Error | null;
  isLoading: boolean;
}
let mockCommunityData: MockCommunityResult = { data: mockCommunity, error: null, isLoading: false };
jest.mock('@/hooks/useCommunities', () => ({
  useCommunity: () => mockCommunityData,
}));

// Mock TokenManagement component since we're testing the view wrapper
jest.mock('@/components/tokens/TokenManagement', () => ({
  TokenManagement: ({ communityId }: { communityId: string }) => (
    <div data-testid="token-management">Token Management for {communityId}</div>
  ),
}));

// Mock Next.js Link
jest.mock('next/link', () => {
  return function MockLink({ children, href }: { children: React.ReactNode; href: string }) {
    return <a href={href}>{children}</a>;
  };
});

describe('CommunityTokensView', () => {
  beforeEach(() => {
    mockCommunityData = { data: mockCommunity, error: null, isLoading: false };
  });

  it('renders the community name as the page title', () => {
    render(<CommunityTokensView communityId={COMMUNITY_ID} />);
    expect(screen.getByRole('heading', { name: 'Tech Cooperative' })).toBeInTheDocument();
  });

  it('renders a subtitle explaining the page purpose', () => {
    render(<CommunityTokensView communityId={COMMUNITY_ID} />);
    expect(screen.getByText('Tokens issued for this community.')).toBeInTheDocument();
  });

  it('renders a back link to the community page', () => {
    render(<CommunityTokensView communityId={COMMUNITY_ID} />);
    const backLink = screen.getByRole('link', { name: /back to community/i });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute('href', `/communities/${COMMUNITY_ID}`);
  });

  it('passes the communityId to TokenManagement', () => {
    render(<CommunityTokensView communityId={COMMUNITY_ID} />);
    expect(screen.getByTestId('token-management')).toHaveTextContent(
      `Token Management for ${COMMUNITY_ID}`
    );
  });

  describe('loading state', () => {
    it('shows a loading indicator while fetching the community', () => {
      mockCommunityData = { data: null, error: null, isLoading: true };
      render(<CommunityTokensView communityId={COMMUNITY_ID} />);
      expect(screen.getByRole('heading', { name: 'Loading…' })).toBeInTheDocument();
    });

    it('still renders TokenManagement while loading', () => {
      mockCommunityData = { data: null, error: null, isLoading: true };
      render(<CommunityTokensView communityId={COMMUNITY_ID} />);
      expect(screen.getByTestId('token-management')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows an error alert when the community cannot be loaded', () => {
      mockCommunityData = {
        data: null,
        error: new Error('Network error'),
        isLoading: false,
      };
      render(<CommunityTokensView communityId={COMMUNITY_ID} />);
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('Could not load this community.');
    });

    it('falls back to generic title when community fails to load', () => {
      mockCommunityData = {
        data: null,
        error: new Error('Network error'),
        isLoading: false,
      };
      render(<CommunityTokensView communityId={COMMUNITY_ID} />);
      expect(screen.getByRole('heading', { name: 'Tokens' })).toBeInTheDocument();
    });

    it('still renders TokenManagement when community loading fails', () => {
      mockCommunityData = {
        data: null,
        error: new Error('Network error'),
        isLoading: false,
      };
      render(<CommunityTokensView communityId={COMMUNITY_ID} />);
      expect(screen.getByTestId('token-management')).toBeInTheDocument();
    });
  });

  describe('missing community name', () => {
    it('falls back to "Tokens" when community name is missing', () => {
      mockCommunityData = {
        data: { ...mockCommunity, name: null },
        error: null,
        isLoading: false,
      };
      render(<CommunityTokensView communityId={COMMUNITY_ID} />);
      expect(screen.getByRole('heading', { name: 'Tokens' })).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('uses proper heading hierarchy', () => {
      render(<CommunityTokensView communityId={COMMUNITY_ID} />);
      const heading = screen.getByRole('heading', { name: 'Tech Cooperative' });
      expect(heading.tagName).toBe('H1');
    });

    it('marks the error message with role="alert"', () => {
      mockCommunityData = {
        data: null,
        error: new Error('Network error'),
        isLoading: false,
      };
      render(<CommunityTokensView communityId={COMMUNITY_ID} />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
