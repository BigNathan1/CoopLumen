import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommunityList } from '../CommunityList';
import type { DiscoverableCommunity } from '../CommunityCard';

function makeCommunity(i: number, overrides: Partial<DiscoverableCommunity> = {}) {
  return {
    id: `comm-${i}`,
    name: `Co-op ${i}`,
    description: `Community number ${i}`,
    asset_code: `CO${i}`,
    asset_issuer: `G${'A'.repeat(55)}`,
    issuer_public_key: `G${'B'.repeat(55)}`,
    created_at: '2025-01-01T00:00:00.000Z',
    member_count: i * 10,
    token_count: i * 100,
    is_joined: false,
    ...overrides,
  } satisfies DiscoverableCommunity;
}

const communities = Array.from({ length: 7 }, (_, i) => makeCommunity(i + 1));

describe('CommunityList', () => {
  it('renders only the first page of communities', () => {
    render(<CommunityList initialCommunities={communities} itemsPerPage={3} />);

    expect(screen.getByText('Co-op 1')).toBeInTheDocument();
    expect(screen.getByText('Co-op 3')).toBeInTheDocument();
    expect(screen.queryByText('Co-op 4')).not.toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('pages forward and back', async () => {
    const user = userEvent.setup();
    render(<CommunityList initialCommunities={communities} itemsPerPage={3} />);

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Co-op 4')).toBeInTheDocument();
    expect(screen.queryByText('Co-op 1')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(screen.getByText('Co-op 1')).toBeInTheDocument();
  });

  it('filters by name or description and resets to the first page', async () => {
    const user = userEvent.setup();
    render(<CommunityList initialCommunities={communities} itemsPerPage={3} />);

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await user.type(screen.getByLabelText('Search communities'), 'number 5');

    expect(screen.getByText('Co-op 5')).toBeInTheDocument();
    expect(screen.queryByText('Co-op 1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', async () => {
    const user = userEvent.setup();
    render(<CommunityList initialCommunities={communities} itemsPerPage={3} />);

    await user.type(screen.getByLabelText('Search communities'), 'nothing matches this');

    expect(screen.getByText('No communities found')).toBeInTheDocument();
    expect(screen.getByText(/nothing matches this/)).toBeInTheDocument();
  });

  it('forwards join requests with the community id', async () => {
    const user = userEvent.setup();
    const onJoin = jest.fn();
    render(<CommunityList initialCommunities={communities} itemsPerPage={3} onJoin={onJoin} />);

    await user.click(screen.getByRole('button', { name: 'Join Co-op 2' }));

    expect(onJoin).toHaveBeenCalledWith('comm-2');
  });
});
