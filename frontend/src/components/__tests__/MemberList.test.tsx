import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '@/lib/api';
import { MemberList } from '../MemberList';
import type { CommunityMember } from '@/hooks/useCommunities';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMember(overrides: Partial<CommunityMember> = {}): CommunityMember {
  return {
    id: 'member-1',
    community_id: 'comm-1',
    stellar_address: 'GABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCDEF',
    role: 'member',
    joined_at: '2025-06-01T00:00:00.000Z',
    ...overrides,
  };
}

const MEMBERS: CommunityMember[] = [
  makeMember({ id: 'member-1', stellar_address: 'G' + 'A'.repeat(55), role: 'admin' }),
  makeMember({ id: 'member-2', stellar_address: 'G' + 'B'.repeat(55), role: 'treasurer' }),
  makeMember({ id: 'member-3', stellar_address: 'G' + 'C'.repeat(55), role: 'member' }),
  makeMember({ id: 'member-4', stellar_address: 'G' + 'D'.repeat(55), role: 'observer' }),
];

function remoteMember(index: number): CommunityMember {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  return {
    id: `remote-${index}`,
    community_id: 'community-1',
    stellar_address: `G${letters[index % letters.length].repeat(55)}`,
    role: index % 2 === 0 ? 'member' : 'admin',
    joined_at: `2025-01-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
  };
}

// ─── Loading state ─────────────────────────────────────────────────────────────

describe('MemberList', () => {
  describe('loading state', () => {
    it('renders a loading skeleton with an accessible label', () => {
      render(<MemberList members={undefined} isLoading={true} error={undefined} />);

      expect(screen.getByRole('status')).toHaveTextContent('Loading members');
    });

    it('renders the section heading even while loading', () => {
      render(<MemberList members={undefined} isLoading={true} error={undefined} />);

      expect(screen.getByRole('heading', { name: 'Members' })).toBeInTheDocument();
    });
  });

  // ─── Error state ───────────────────────────────────────────────────────────

  describe('error state', () => {
    it('renders an error alert with the error message', () => {
      const error = new Error('Network failure');
      render(<MemberList members={undefined} isLoading={false} error={error} />);

      expect(screen.getByRole('alert')).toHaveTextContent('Network failure');
    });

    it('renders the section heading in the error state', () => {
      render(<MemberList members={undefined} isLoading={false} error={new Error('oops')} />);

      expect(screen.getByRole('heading', { name: 'Members' })).toBeInTheDocument();
    });
  });

  // ─── Empty state ───────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows an empty state when the members array is empty', () => {
      render(<MemberList members={[]} isLoading={false} error={undefined} />);

      expect(screen.getByText('No members yet')).toBeInTheDocument();
    });
  });

  // ─── Populated state ───────────────────────────────────────────────────────

  describe('populated state', () => {
    it('renders all members', () => {
      render(<MemberList members={MEMBERS} isLoading={false} error={undefined} />);

      // Each item is an <li>
      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(MEMBERS.length);
    });

    it('shows the member count in the heading', () => {
      render(<MemberList members={MEMBERS} isLoading={false} error={undefined} />);

      expect(screen.getByLabelText(`${MEMBERS.length} members`)).toBeInTheDocument();
    });

    it('renders role badges with screen-reader prefixed labels', () => {
      render(<MemberList members={MEMBERS} isLoading={false} error={undefined} />);

      // srLabel="Role: " prepends to the visible text
      expect(screen.getByText('Admin')).toBeInTheDocument();
      expect(screen.getByText('Treasurer')).toBeInTheDocument();
      expect(screen.getByText('Member')).toBeInTheDocument();
      expect(screen.getByText('Observer')).toBeInTheDocument();
    });

    it('renders join dates', () => {
      render(<MemberList members={MEMBERS} isLoading={false} error={undefined} />);

      // All members share the same joined_at, so expect at least one date element
      const times = screen.getAllByRole('time');
      expect(times.length).toBeGreaterThan(0);
      expect(times[0]).toHaveAttribute('dateTime', '2025-06-01T00:00:00.000Z');
    });

    it('does not render the loading skeleton or error alert', () => {
      render(<MemberList members={MEMBERS} isLoading={false} error={undefined} />);

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('truncates long Stellar addresses', () => {
      const longAddress = 'G' + 'A'.repeat(55);
      render(
        <MemberList
          members={[makeMember({ stellar_address: longAddress })]}
          isLoading={false}
          error={undefined}
        />
      );

      // Full address is 56 chars; displayed version should be truncated
      const code = screen.getByTitle(longAddress).closest('span');
      expect(code?.textContent?.length).toBeLessThan(longAddress.length);
    });
  });

  // ─── Accessibility ─────────────────────────────────────────────────────────

  describe('accessibility', () => {
    it('wraps members in a <ul> list', () => {
      render(<MemberList members={MEMBERS} isLoading={false} error={undefined} />);

      expect(screen.getByRole('list')).toBeInTheDocument();
    });

    it('has a section landmark with an accessible label', () => {
      render(<MemberList members={MEMBERS} isLoading={false} error={undefined} />);

      expect(screen.getByRole('region', { name: 'Community members' })).toBeInTheDocument();
    });
  });

  // ─── Pagination (local) ────────────────────────────────────────────────────

  describe('pagination with local data', () => {
    const paginationMembers = Array.from({ length: 5 }, (_, i) => remoteMember(i));

    it('paginates local member data', async () => {
      const user = userEvent.setup();
      render(<MemberList members={paginationMembers} pageSize={2} />);

      expect(screen.getByTitle(paginationMembers[0].stellar_address)).toBeInTheDocument();
      expect(screen.getByTitle(paginationMembers[1].stellar_address)).toBeInTheDocument();
      expect(screen.queryByTitle(paginationMembers[2].stellar_address)).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Go to next page' }));

      expect(screen.getByTitle(paginationMembers[2].stellar_address)).toBeInTheDocument();
      expect(screen.getByTitle(paginationMembers[3].stellar_address)).toBeInTheDocument();
      expect(screen.queryByTitle(paginationMembers[0].stellar_address)).not.toBeInTheDocument();
      expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    });

    it('clamps an invalid controlled page to the available range', () => {
      render(<MemberList members={paginationMembers} pageSize={2} page={99} />);

      expect(screen.getByTitle(paginationMembers[4].stellar_address)).toBeInTheDocument();
      expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
    });
  });

  // ─── Pagination (remote / communityId) ────────────────────────────────────

  describe('pagination with remote data', () => {
    it('fetches a server page and renders its pagination metadata', async () => {
      const raw = jest.spyOn(api, 'raw').mockResolvedValue({
        data: [remoteMember(4)],
        meta: { total: 12, page: 1, limit: 1, pages: 12, offset: 0 },
      });

      render(<MemberList communityId="community-1" pageSize={1} />);

      await waitFor(() =>
        expect(screen.getByTitle(remoteMember(4).stellar_address)).toBeInTheDocument()
      );
      expect(raw).toHaveBeenCalledWith(
        'GET',
        '/api/v1/communities/community-1/members',
        expect.objectContaining({ query: { page: 1, limit: 1 } })
      );
      expect(screen.getByText('Page 1 of 12')).toBeInTheDocument();

      raw.mockRestore();
    });
  });
});
