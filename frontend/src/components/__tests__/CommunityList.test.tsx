import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommunityList } from '@/components/CommunityList';
import type { DiscoverableCommunity } from '@/components/CommunityCard';

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

  it('shows every community and no pagination when they fit on one page', () => {
    render(<CommunityList initialCommunities={communities.slice(0, 3)} itemsPerPage={6} />);

    expect(screen.getAllByRole('button', { name: /^Join Co-op/ })).toHaveLength(3);
    expect(screen.queryByText(/^Page \d+ of \d+$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next page' })).not.toBeInTheDocument();
  });

  it('defaults to six communities per page', () => {
    render(<CommunityList initialCommunities={communities} />);

    expect(screen.getByText('Co-op 6')).toBeInTheDocument();
    expect(screen.queryByText('Co-op 7')).not.toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  });

  it('disables Previous on the first page and Next on the last page', async () => {
    const user = userEvent.setup();
    render(<CommunityList initialCommunities={communities} itemsPerPage={3} />);

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
    expect(screen.getByText('Co-op 7')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled();
  });

  it('matches the search case-insensitively', async () => {
    const user = userEvent.setup();
    render(<CommunityList initialCommunities={communities} itemsPerPage={3} />);

    await user.type(screen.getByLabelText('Search communities'), 'CO-OP 2');

    expect(screen.getByText('Co-op 2')).toBeInTheDocument();
    expect(screen.queryByText('Co-op 1')).not.toBeInTheDocument();
  });

  it('matches on description when the name does not match', async () => {
    const user = userEvent.setup();
    const list = [
      makeCommunity(1, { name: 'Alpha', description: 'Solar panels' }),
      makeCommunity(2, { name: 'Beta', description: 'Fishing' }),
    ];
    render(<CommunityList initialCommunities={list} />);

    await user.type(screen.getByLabelText('Search communities'), 'solar');

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  });

  it('does not throw for communities without a description and still matches by name', async () => {
    const user = userEvent.setup();
    const list = [
      makeCommunity(1, { name: 'Alpha', description: undefined }),
      makeCommunity(2, { name: 'Beta', description: undefined }),
    ];
    render(<CommunityList initialCommunities={list} />);

    await user.type(screen.getByLabelText('Search communities'), 'beta');

    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });

  it('ignores a whitespace-only query and restores the full list once cleared', async () => {
    const user = userEvent.setup();
    render(<CommunityList initialCommunities={communities} itemsPerPage={3} />);
    const search = screen.getByLabelText('Search communities');

    await user.type(search, '   ');
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'zzz');
    expect(screen.getByText('No communities found')).toBeInTheDocument();

    await user.clear(search);
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('renders the empty state for an empty community list', () => {
    render(<CommunityList initialCommunities={[]} />);

    expect(screen.getByText('No communities found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Join/ })).not.toBeInTheDocument();
  });

  it('exposes an accessible search field and a live page indicator', () => {
    render(<CommunityList initialCommunities={communities} itemsPerPage={3} />);

    expect(screen.getByRole('searchbox', { name: 'Search communities' })).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toHaveAttribute('aria-live', 'polite');
  });
});
