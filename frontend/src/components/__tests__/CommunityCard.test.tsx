import { render, screen } from '@testing-library/react';
import { CommunityCard } from '../CommunityCard';
import type { Community } from '@/hooks/useCommunities';

const mockCommunity: Community = {
  id: 'uuid-1',
  name: 'EcoDAO',
  description: 'An eco-friendly community',
  asset_code: 'ECO',
  asset_issuer: 'G' + 'A'.repeat(55),
  issuer_public_key: 'G' + 'B'.repeat(55),
  created_at: '2025-01-01T00:00:00.000Z',
};

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
});
