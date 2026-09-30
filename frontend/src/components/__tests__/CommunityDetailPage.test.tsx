import { render, screen } from '@testing-library/react';
import { CommunityDetailPage } from '@/app/communities/[id]/CommunityDetailPage';
import {
  useCommunity,
  useCommunityMembers,
  type Community,
  type CommunityMember,
} from '@/hooks/useCommunities';

jest.mock('@/hooks/useCommunities');
// StellarAddress renders clipboard and external link buttons — stub so we
// don't need to wire up the clipboard API in jsdom.
jest.mock('@/components/ui/StellarAddress', () => ({
  StellarAddress: ({ address }: { address: string }) => (
    <span data-testid="stellar-address">{address}</span>
  ),
}));

const mockUseCommunity = useCommunity as jest.Mock;
const mockUseCommunityMembers = useCommunityMembers as jest.Mock;

const COMMUNITY: Community = {
  id: 'uuid-1',
  name: 'EcoDAO Lagos',
  description: 'An eco-finance cooperative.',
  asset_code: 'ECOLGS',
  asset_issuer: 'G' + 'A'.repeat(55),
  issuer_public_key: 'G' + 'B'.repeat(55),
  created_at: '2025-03-15T00:00:00.000Z',
};

const MEMBERS: CommunityMember[] = [
  {
    id: 'm-1',
    community_id: 'uuid-1',
    stellar_address: 'G' + 'C'.repeat(55),
    role: 'admin',
    joined_at: '2025-03-16T00:00:00.000Z',
  },
  {
    id: 'm-2',
    community_id: 'uuid-1',
    stellar_address: 'G' + 'D'.repeat(55),
    role: 'member',
    joined_at: '2025-04-01T00:00:00.000Z',
  },
];

function mockLoaded() {
  mockUseCommunity.mockReturnValue({ data: COMMUNITY, error: undefined, isLoading: false });
  mockUseCommunityMembers.mockReturnValue({ data: MEMBERS, error: undefined, isLoading: false });
}

describe('CommunityDetailPage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  /* ── Loading states ── */

  it('shows a loading spinner while the community is being fetched', () => {
    mockUseCommunity.mockReturnValue({ data: undefined, error: undefined, isLoading: true });
    mockUseCommunityMembers.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
    });

    render(<CommunityDetailPage communityId="uuid-1" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading community…');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  /* ── Error states ── */

  it('shows an error alert when the community fetch fails', () => {
    mockUseCommunity.mockReturnValue({
      data: undefined,
      error: new Error('Community not found'),
      isLoading: false,
    });
    mockUseCommunityMembers.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
    });

    render(<CommunityDetailPage communityId="uuid-missing" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Community not found');
  });

  it('shows a back link in the error state', () => {
    mockUseCommunity.mockReturnValue({
      data: undefined,
      error: new Error('Not found'),
      isLoading: false,
    });
    mockUseCommunityMembers.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
    });

    render(<CommunityDetailPage communityId="uuid-missing" />);

    expect(screen.getByRole('link', { name: /back to communities/i })).toBeInTheDocument();
  });

  /* ── Populated / happy path ── */

  it('renders the community name as the page heading', () => {
    mockLoaded();

    render(<CommunityDetailPage communityId="uuid-1" />);

    expect(screen.getByRole('heading', { level: 1, name: 'EcoDAO Lagos' })).toBeInTheDocument();
  });

  it('renders the asset code badge', () => {
    mockLoaded();

    render(<CommunityDetailPage communityId="uuid-1" />);

    expect(screen.getByLabelText('Token: ECOLGS')).toBeInTheDocument();
  });

  it('renders the community description', () => {
    mockLoaded();

    render(<CommunityDetailPage communityId="uuid-1" />);

    expect(screen.getByText('An eco-finance cooperative.')).toBeInTheDocument();
  });

  it('omits the description paragraph when description is null', () => {
    mockUseCommunity.mockReturnValue({
      data: { ...COMMUNITY, description: null },
      error: undefined,
      isLoading: false,
    });
    mockUseCommunityMembers.mockReturnValue({ data: MEMBERS, error: undefined, isLoading: false });

    render(<CommunityDetailPage communityId="uuid-1" />);

    expect(screen.queryByText('An eco-finance cooperative.')).not.toBeInTheDocument();
  });

  it('renders a creation date with the correct dateTime attribute', () => {
    mockLoaded();

    render(<CommunityDetailPage communityId="uuid-1" />);

    // There are multiple <time> elements (community creation + member join dates).
    // The community's creation time is the first one rendered.
    const times = screen.getAllByRole('time');
    const communityTime = times.find((t) => t.getAttribute('dateTime') === COMMUNITY.created_at);
    expect(communityTime).toBeDefined();
    expect(communityTime).toHaveAttribute('dateTime', COMMUNITY.created_at);
  });

  it('renders two StellarAddress elements for the keys', () => {
    mockLoaded();

    render(<CommunityDetailPage communityId="uuid-1" />);

    const addresses = screen.getAllByTestId('stellar-address');
    // asset_issuer + issuer_public_key
    expect(addresses).toHaveLength(2);
  });

  it('renders a back navigation link pointing to /communities', () => {
    mockLoaded();

    render(<CommunityDetailPage communityId="uuid-1" />);

    const backLink = screen.getByRole('link', { name: /back to communities/i });
    expect(backLink).toHaveAttribute('href', '/communities');
  });

  /* ── Members section ── */

  it('renders the member list when members are available', () => {
    mockLoaded();

    render(<CommunityDetailPage communityId="uuid-1" />);

    // MemberList renders an <h2> for "Members"
    expect(screen.getByRole('heading', { level: 2, name: /members/i })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(MEMBERS.length);
  });

  it('shows members loading state when members are still being fetched', () => {
    mockUseCommunity.mockReturnValue({ data: COMMUNITY, error: undefined, isLoading: false });
    mockUseCommunityMembers.mockReturnValue({ data: undefined, error: undefined, isLoading: true });

    render(<CommunityDetailPage communityId="uuid-1" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading members');
  });

  it('shows members error alert when the members fetch fails', () => {
    mockUseCommunity.mockReturnValue({ data: COMMUNITY, error: undefined, isLoading: false });
    mockUseCommunityMembers.mockReturnValue({
      data: undefined,
      error: new Error('Members unavailable'),
      isLoading: false,
    });

    render(<CommunityDetailPage communityId="uuid-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Members unavailable');
  });

  /* ── Accessibility ── */

  it('renders the page inside a <main> landmark', () => {
    mockLoaded();

    render(<CommunityDetailPage communityId="uuid-1" />);

    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('passes the community name through to the main landmark label', () => {
    mockLoaded();

    render(<CommunityDetailPage communityId="uuid-1" />);

    expect(screen.getByRole('main', { name: /EcoDAO Lagos/i })).toBeInTheDocument();
  });
});
