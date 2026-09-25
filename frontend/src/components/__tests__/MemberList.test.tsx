import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '@/lib/api';
import { MemberList, type CommunityMember } from '../MemberList';

function member(index: number, overrides: Partial<CommunityMember> = {}): CommunityMember {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  return {
    stellar_address: `G${letters[index % letters.length].repeat(55)}`,
    role: index % 2 === 0 ? 'member' : 'admin',
    joined_at: `2025-01-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
    ...overrides,
  };
}

const members = Array.from({ length: 5 }, (_, index) => member(index));

describe('MemberList', () => {
  it('shows address, role, and join date', () => {
    render(<MemberList members={[member(0)]} />);

    expect(screen.getByRole('table', { name: 'Community members' })).toBeInTheDocument();
    expect(screen.getByText(members[0].stellar_address)).toBeInTheDocument();
    expect(screen.getByText('Member')).toBeInTheDocument();
    expect(screen.getByText(/2025/)).toBeInTheDocument();
  });

  it('paginates local member data', async () => {
    const user = userEvent.setup();
    render(<MemberList members={members} pageSize={2} />);

    expect(screen.getByText(members[0].stellar_address)).toBeInTheDocument();
    expect(screen.getByText(members[1].stellar_address)).toBeInTheDocument();
    expect(screen.queryByText(members[2].stellar_address)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Go to next page' }));

    expect(screen.getByText(members[2].stellar_address)).toBeInTheDocument();
    expect(screen.getByText(members[3].stellar_address)).toBeInTheDocument();
    expect(screen.queryByText(members[0].stellar_address)).not.toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('fetches a server page and renders its pagination metadata', async () => {
    const raw = jest.spyOn(api, 'raw').mockResolvedValue({
      data: [member(4)],
      meta: { total: 12, page: 1, limit: 1, pages: 12, offset: 0 },
    });

    render(<MemberList communityId="community-1" pageSize={1} />);

    await waitFor(() => expect(screen.getByText(member(4).stellar_address)).toBeInTheDocument());
    expect(raw).toHaveBeenCalledWith(
      'GET',
      '/api/v1/communities/community-1/members',
      expect.objectContaining({ query: { page: 1, limit: 1 } })
    );
    expect(screen.getByText('Page 1 of 12')).toBeInTheDocument();

    raw.mockRestore();
  });

  it('clamps an invalid controlled page to the available range', () => {
    render(<MemberList members={members} pageSize={2} page={99} />);

    expect(screen.getByText(members[4].stellar_address)).toBeInTheDocument();
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
  });

  it('shows an empty state when there are no members', () => {
    render(<MemberList members={[]} />);
    expect(screen.getByText('No members found')).toBeInTheDocument();
  });
});
