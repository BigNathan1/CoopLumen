import { render, screen } from '@testing-library/react';
import { MemberList } from '../MemberList';
import type { CommunityMember } from '@/hooks/useCommunities';

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
  makeMember({ id: 'member-1', stellar_address: 'GAAAA' + 'A'.repeat(51), role: 'admin' }),
  makeMember({ id: 'member-2', stellar_address: 'GBBBB' + 'B'.repeat(51), role: 'treasurer' }),
  makeMember({ id: 'member-3', stellar_address: 'GCCCC' + 'C'.repeat(51), role: 'member' }),
  makeMember({ id: 'member-4', stellar_address: 'GDDDD' + 'D'.repeat(51), role: 'observer' }),
];

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

  describe('empty state', () => {
    it('shows an empty state when the members array is empty', () => {
      render(<MemberList members={[]} isLoading={false} error={undefined} />);

      expect(screen.getByText('No members yet')).toBeInTheDocument();
    });
  });

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

      // srLabel="Role: " prepends to the visible text, so screen readers hear "Role: Admin"
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

      // Full address is 56 chars; displayed version should be truncated (< 56 chars)
      const code = screen.getByTitle(longAddress).closest('span');
      expect(code?.textContent?.length).toBeLessThan(longAddress.length);
    });
  });

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
});
