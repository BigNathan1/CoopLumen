import { render, screen } from '@testing-library/react';
import { CommunityCard } from '@/components/community/CommunityCard';
import type { Community } from '@/hooks/useCommunities';
import { useKycStatus } from '@/hooks/useKycStatus';

jest.mock('@/hooks/useKycStatus');

const mockUseKycStatus = useKycStatus as jest.Mock;

const mockCommunity: Community = {
  id: 'uuid-1',
  name: 'EcoDAO',
  description: 'An eco-friendly community',
  asset_code: 'ECO',
  asset_issuer: 'G' + 'A'.repeat(55),
  issuer_public_key: 'G' + 'B'.repeat(55),
  created_at: '2025-01-01T00:00:00.000Z',
};

beforeEach(() => {
  jest.resetAllMocks();
  mockUseKycStatus.mockReturnValue({ data: undefined, error: undefined });
});

describe('CommunityCard', () => {
  it('renders community name and asset code', () => {
    render(<CommunityCard community={mockCommunity} />);
    expect(screen.getByText('EcoDAO')).toBeInTheDocument();
    expect(screen.getByText('ECO')).toBeInTheDocument();
  });

  it('renders description when present', () => {
    render(<CommunityCard community={mockCommunity} />);
    expect(screen.getByText('An eco-friendly community')).toBeInTheDocument();
  });

  it('omits description element when null', () => {
    render(<CommunityCard community={{ ...mockCommunity, description: null }} />);
    expect(screen.queryByText('An eco-friendly community')).not.toBeInTheDocument();
  });

  it("shows the issuer's KYC badge once the status is known", () => {
    mockUseKycStatus.mockReturnValue({
      data: { address: mockCommunity.issuer_public_key, status: 'approved' },
      error: undefined,
    });

    render(<CommunityCard community={mockCommunity} />);

    expect(mockUseKycStatus).toHaveBeenCalledWith(mockCommunity.issuer_public_key);
    expect(screen.getByText('KYC verified')).toBeInTheDocument();
  });

  it('omits the KYC badge while the status is unknown', () => {
    render(<CommunityCard community={mockCommunity} />);

    expect(screen.queryByText('KYC verified')).not.toBeInTheDocument();
  });
});
