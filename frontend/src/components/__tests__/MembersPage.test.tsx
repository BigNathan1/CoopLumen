import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MembersPage } from '@/app/communities/[id]/members/MembersPage';
import {
  useCommunity,
  useCommunityMembers,
  useAddMember,
  useRemoveMember,
  type Community,
  type CommunityMember,
} from '@/hooks/useCommunities';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('@/hooks/useCommunities');
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// ── Typed mock handles ────────────────────────────────────────────────────────

const mockUseCommunity = useCommunity as jest.MockedFunction<typeof useCommunity>;
const mockUseCommunityMembers = useCommunityMembers as jest.MockedFunction<
  typeof useCommunityMembers
>;
const mockUseAddMember = useAddMember as jest.MockedFunction<typeof useAddMember>;
const mockUseRemoveMember = useRemoveMember as jest.MockedFunction<typeof useRemoveMember>;

// ── Test fixtures ─────────────────────────────────────────────────────────────

const COMMUNITY: Community = {
  id: 'comm-1',
  name: 'Eco Coop Lagos',
  description: 'A sustainable cooperative',
  asset_code: 'ECO',
  asset_issuer: `G${'A'.repeat(55)}`,
  issuer_public_key: `G${'A'.repeat(55)}`,
  created_at: '2026-01-01T00:00:00.000Z',
};

function makeMember(overrides: Partial<CommunityMember> = {}): CommunityMember {
  return {
    id: 'member-1',
    community_id: 'comm-1',
    stellar_address: `G${'B'.repeat(55)}`,
    role: 'member',
    joined_at: '2026-03-15T00:00:00.000Z',
    ...overrides,
  };
}

const MEMBER_ADMIN = makeMember({
  id: 'member-admin',
  role: 'admin',
  stellar_address: `G${'C'.repeat(55)}`,
});
const MEMBER_TREASURER = makeMember({
  id: 'member-treasurer',
  role: 'treasurer',
  stellar_address: `G${'D'.repeat(55)}`,
});
const MEMBER_OBSERVER = makeMember({
  id: 'member-observer',
  role: 'observer',
  stellar_address: `G${'E'.repeat(55)}`,
});
const MEMBER_REGULAR = makeMember({
  id: 'member-regular',
  role: 'member',
  stellar_address: `G${'B'.repeat(55)}`,
});

// ── Default mock factories ────────────────────────────────────────────────────

function mockCommunityLoaded(overrides: Partial<Community> = {}) {
  mockUseCommunity.mockReturnValue({
    data: { ...COMMUNITY, ...overrides },
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: jest.fn(),
  } as ReturnType<typeof useCommunity>);
}

function mockCommunityLoading() {
  mockUseCommunity.mockReturnValue({
    data: undefined,
    error: undefined,
    isLoading: true,
    isValidating: false,
    mutate: jest.fn(),
  } as ReturnType<typeof useCommunity>);
}

function mockCommunityError(message = 'Community not found') {
  mockUseCommunity.mockReturnValue({
    data: undefined,
    error: new Error(message),
    isLoading: false,
    isValidating: false,
    mutate: jest.fn(),
  } as ReturnType<typeof useCommunity>);
}

function mockMembersLoaded(members: CommunityMember[] = [MEMBER_REGULAR]) {
  mockUseCommunityMembers.mockReturnValue({
    data: members,
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: jest.fn(),
  } as ReturnType<typeof useCommunityMembers>);
}

function mockMembersLoading() {
  mockUseCommunityMembers.mockReturnValue({
    data: undefined,
    error: undefined,
    isLoading: true,
    isValidating: false,
    mutate: jest.fn(),
  } as ReturnType<typeof useCommunityMembers>);
}

function mockMembersError(message = 'Failed to load members') {
  mockUseCommunityMembers.mockReturnValue({
    data: undefined,
    error: new Error(message),
    isLoading: false,
    isValidating: false,
    mutate: jest.fn(),
  } as ReturnType<typeof useCommunityMembers>);
}

function mockAddMember(overrides: Partial<ReturnType<typeof useAddMember>> = {}) {
  mockUseAddMember.mockReturnValue({
    addMember: jest.fn().mockResolvedValue(MEMBER_REGULAR),
    submitting: false,
    error: null,
    ...overrides,
  });
}

function mockRemoveMember(overrides: Partial<ReturnType<typeof useRemoveMember>> = {}) {
  mockUseRemoveMember.mockReturnValue({
    removeMember: jest.fn().mockResolvedValue(true),
    submitting: false,
    error: null,
    ...overrides,
  });
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  jest.resetAllMocks();
  mockCommunityLoaded();
  mockMembersLoaded();
  mockAddMember();
  mockRemoveMember();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MembersPage', () => {
  // ── Loading & error states ──────────────────────────────────────────────────

  describe('loading states', () => {
    it('shows a spinner while the community is loading', () => {
      mockCommunityLoading();
      mockMembersLoading();
      render(<MembersPage communityId="comm-1" />);

      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByText('Members')).not.toBeInTheDocument();
    });

    it('shows skeleton rows while members are loading', () => {
      mockMembersLoading();
      render(<MembersPage communityId="comm-1" />);

      // Skeleton list is announced once for screen readers
      expect(screen.getByLabelText('Members loading')).toBeInTheDocument();
    });
  });

  describe('community error state', () => {
    it('shows an error alert and a back link when the community fails to load', () => {
      mockCommunityError('Community not found');
      render(<MembersPage communityId="comm-99" />);

      expect(screen.getByRole('link', { name: /Back to communities/i })).toHaveAttribute(
        'href',
        '/communities'
      );
      // The alert title "Community not found" renders as a heading/title inside
      // the Alert component; confirm the alert region is present.
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getAllByText('Community not found').length).toBeGreaterThanOrEqual(1);
    });

    it('shows a fallback message when community data is absent without an explicit error', () => {
      mockUseCommunity.mockReturnValue({
        data: undefined,
        error: undefined,
        isLoading: false,
        isValidating: false,
        mutate: jest.fn(),
      } as ReturnType<typeof useCommunity>);

      render(<MembersPage communityId="comm-99" />);

      expect(
        screen.getByText(/This community does not exist or could not be loaded/i)
      ).toBeInTheDocument();
    });
  });

  describe('members error state', () => {
    it('shows an error alert when members fail to load', () => {
      mockMembersError('Network error');
      render(<MembersPage communityId="comm-1" />);

      expect(screen.getByText('Could not load members')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  // ── Loaded state ────────────────────────────────────────────────────────────

  describe('loaded state', () => {
    it('renders the back link pointing to the community detail page', () => {
      render(<MembersPage communityId="comm-1" />);

      const backLink = screen.getByRole('link', { name: /Back to Eco Coop Lagos/i });
      expect(backLink).toHaveAttribute('href', '/communities/comm-1');
    });

    it('renders "Members" and "Add a member" section headings', () => {
      render(<MembersPage communityId="comm-1" />);

      expect(screen.getByRole('heading', { name: /Members/ })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Add a member' })).toBeInTheDocument();
    });

    it('shows the member count badge next to the heading', () => {
      mockMembersLoaded([MEMBER_REGULAR, MEMBER_ADMIN]);
      render(<MembersPage communityId="comm-1" />);

      // Count badge has an accessible label
      expect(screen.getByLabelText('2 members')).toBeInTheDocument();
    });

    it('renders the member list as a list landmark', () => {
      render(<MembersPage communityId="comm-1" />);

      expect(screen.getByRole('list', { name: 'Community members' })).toBeInTheDocument();
    });

    it('shows an empty state when there are no members', () => {
      mockMembersLoaded([]);
      render(<MembersPage communityId="comm-1" />);

      expect(screen.getByText('No members yet')).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Community members' })).not.toBeInTheDocument();
    });
  });

  // ── Member rows ─────────────────────────────────────────────────────────────

  describe('member rows', () => {
    it('displays a truncated address for each member', () => {
      mockMembersLoaded([MEMBER_REGULAR]);
      render(<MembersPage communityId="comm-1" />);

      // Address is 56 chars, so we expect a truncated version
      const address = MEMBER_REGULAR.stellar_address;
      const expected = `${address.slice(0, 6)}…${address.slice(-4)}`;
      expect(screen.getByText(expected)).toBeInTheDocument();
    });

    it('shows the joined date for each member', () => {
      mockMembersLoaded([MEMBER_REGULAR]);
      render(<MembersPage communityId="comm-1" />);

      // 2026-03-15 — exact format depends on locale, but "2026" must appear
      expect(screen.getByText(/2026/)).toBeInTheDocument();
    });

    it('renders a Remove button with an accessible label naming the member', () => {
      mockMembersLoaded([MEMBER_REGULAR]);
      render(<MembersPage communityId="comm-1" />);

      const address = MEMBER_REGULAR.stellar_address;
      const truncated = `${address.slice(0, 6)}…${address.slice(-4)}`;
      expect(screen.getByRole('button', { name: `Remove ${truncated}` })).toBeInTheDocument();
    });

    it('renders role badges for each member', () => {
      mockMembersLoaded([MEMBER_ADMIN, MEMBER_TREASURER, MEMBER_REGULAR, MEMBER_OBSERVER]);
      render(<MembersPage communityId="comm-1" />);

      const list = screen.getByRole('list', { name: 'Community members' });
      expect(within(list).getByText('Admin')).toBeInTheDocument();
      expect(within(list).getByText('Treasurer')).toBeInTheDocument();
      expect(within(list).getAllByText('Member')).toHaveLength(1);
      expect(within(list).getByText('Observer')).toBeInTheDocument();
    });
  });

  // ── Add member form ─────────────────────────────────────────────────────────

  describe('add member form', () => {
    it('renders the Stellar address input with a visible label', () => {
      render(<MembersPage communityId="comm-1" />);

      expect(screen.getByLabelText(/Stellar address/i)).toBeInTheDocument();
    });

    it('renders the role select with a visible label', () => {
      render(<MembersPage communityId="comm-1" />);

      expect(screen.getByLabelText('Role')).toBeInTheDocument();
    });

    it('renders all role options in the select', () => {
      render(<MembersPage communityId="comm-1" />);

      const select = screen.getByLabelText('Role') as HTMLSelectElement;
      const optionValues = Array.from(select.options).map((o) => o.value);
      expect(optionValues).toEqual(
        expect.arrayContaining(['admin', 'treasurer', 'member', 'observer'])
      );
    });

    it('shows a validation error when submitting an invalid Stellar address', async () => {
      const user = userEvent.setup();
      render(<MembersPage communityId="comm-1" />);

      const input = screen.getByLabelText(/Stellar address/i);
      await user.type(input, 'not-a-valid-key');
      await user.click(screen.getByRole('button', { name: 'Add member' }));

      expect(screen.getByText(/Enter a valid Stellar public key/i)).toBeInTheDocument();
    });

    it('marks the address input as aria-invalid on validation failure', async () => {
      const user = userEvent.setup();
      render(<MembersPage communityId="comm-1" />);

      await user.type(screen.getByLabelText(/Stellar address/i), 'bad-key');
      await user.click(screen.getByRole('button', { name: 'Add member' }));

      expect(screen.getByLabelText(/Stellar address/i)).toHaveAttribute('aria-invalid', 'true');
    });

    it('announces the validation error via role="alert"', async () => {
      const user = userEvent.setup();
      render(<MembersPage communityId="comm-1" />);

      await user.type(screen.getByLabelText(/Stellar address/i), 'bad');
      await user.click(screen.getByRole('button', { name: 'Add member' }));

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('clears the validation error when the user edits the address', async () => {
      const user = userEvent.setup();
      render(<MembersPage communityId="comm-1" />);

      const input = screen.getByLabelText(/Stellar address/i);
      await user.type(input, 'bad');
      await user.click(screen.getByRole('button', { name: 'Add member' }));
      expect(screen.getByRole('alert')).toBeInTheDocument();

      await user.clear(input);
      await user.type(input, 'G');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('calls addMember with the correct payload on valid submit', async () => {
      const addMemberFn = jest.fn().mockResolvedValue(MEMBER_REGULAR);
      mockAddMember({ addMember: addMemberFn });
      const user = userEvent.setup();
      render(<MembersPage communityId="comm-1" />);

      const validAddress = `G${'F'.repeat(55)}`;
      await user.type(screen.getByLabelText(/Stellar address/i), validAddress);

      const roleSelect = screen.getByLabelText('Role') as HTMLSelectElement;
      await user.selectOptions(roleSelect, 'treasurer');

      await user.click(screen.getByRole('button', { name: 'Add member' }));

      expect(addMemberFn).toHaveBeenCalledWith({
        stellarAddress: validAddress,
        role: 'treasurer',
      });
    });

    it('shows a success alert after a member is added', async () => {
      const addMemberFn = jest.fn().mockResolvedValue(MEMBER_REGULAR);
      mockAddMember({ addMember: addMemberFn });
      const user = userEvent.setup();
      render(<MembersPage communityId="comm-1" />);

      const validAddress = `G${'F'.repeat(55)}`;
      await user.type(screen.getByLabelText(/Stellar address/i), validAddress);
      await user.click(screen.getByRole('button', { name: 'Add member' }));

      await waitFor(() => {
        expect(screen.getByText('Member added successfully.')).toBeInTheDocument();
      });
    });

    it('resets the address input after a successful add', async () => {
      const addMemberFn = jest.fn().mockResolvedValue(MEMBER_REGULAR);
      mockAddMember({ addMember: addMemberFn });
      const user = userEvent.setup();
      render(<MembersPage communityId="comm-1" />);

      const input = screen.getByLabelText(/Stellar address/i);
      await user.type(input, `G${'F'.repeat(55)}`);
      await user.click(screen.getByRole('button', { name: 'Add member' }));

      await waitFor(() => {
        expect(input).toHaveValue('');
      });
    });

    it('shows an API error alert when addMember returns null', async () => {
      // addMember returns null on failure; the error string comes from the hook
      const addMemberFn = jest.fn().mockResolvedValue(null);
      mockAddMember({ addMember: addMemberFn, error: 'Stellar address already a member' });
      render(<MembersPage communityId="comm-1" />);

      expect(screen.getByText('Stellar address already a member')).toBeInTheDocument();
    });

    it('disables the submit button and shows a loading label while submitting', () => {
      mockAddMember({ submitting: true });
      render(<MembersPage communityId="comm-1" />);

      const submitBtn = screen.getByRole('button', { name: /Adding member/i });
      expect(submitBtn).toBeDisabled();
    });

    it('does not call addMember when the address field is empty', async () => {
      const addMemberFn = jest.fn();
      mockAddMember({ addMember: addMemberFn });
      const user = userEvent.setup();
      render(<MembersPage communityId="comm-1" />);

      await user.click(screen.getByRole('button', { name: 'Add member' }));

      expect(addMemberFn).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // ── Remove member flow ──────────────────────────────────────────────────────

  describe('remove member flow', () => {
    it('opens a confirm dialog when the Remove button is clicked', async () => {
      const user = userEvent.setup();
      mockMembersLoaded([MEMBER_REGULAR]);
      render(<MembersPage communityId="comm-1" />);

      const address = MEMBER_REGULAR.stellar_address;
      const truncated = `${address.slice(0, 6)}…${address.slice(-4)}`;
      await user.click(screen.getByRole('button', { name: `Remove ${truncated}` }));

      expect(screen.getByText('Remove member?')).toBeInTheDocument();
    });

    it('calls removeMember with the member id when the dialog is confirmed', async () => {
      const removeMemberFn = jest.fn().mockResolvedValue(true);
      mockRemoveMember({ removeMember: removeMemberFn });
      const user = userEvent.setup();
      mockMembersLoaded([MEMBER_REGULAR]);
      render(<MembersPage communityId="comm-1" />);

      const address = MEMBER_REGULAR.stellar_address;
      const truncated = `${address.slice(0, 6)}…${address.slice(-4)}`;
      await user.click(screen.getByRole('button', { name: `Remove ${truncated}` }));
      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(removeMemberFn).toHaveBeenCalledWith(MEMBER_REGULAR.id);
    });

    it('closes the confirm dialog without calling removeMember when cancelled', async () => {
      const removeMemberFn = jest.fn();
      mockRemoveMember({ removeMember: removeMemberFn });
      const user = userEvent.setup();
      mockMembersLoaded([MEMBER_REGULAR]);
      render(<MembersPage communityId="comm-1" />);

      const address = MEMBER_REGULAR.stellar_address;
      const truncated = `${address.slice(0, 6)}…${address.slice(-4)}`;
      await user.click(screen.getByRole('button', { name: `Remove ${truncated}` }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(removeMemberFn).not.toHaveBeenCalled();
      expect(screen.queryByText('Remove member?')).not.toBeInTheDocument();
    });

    it('shows a remove error alert when the remove hook returns an error', () => {
      mockRemoveMember({ error: 'Cannot remove the last admin' });
      mockMembersLoaded([MEMBER_REGULAR]);
      render(<MembersPage communityId="comm-1" />);

      expect(screen.getByText('Could not remove member')).toBeInTheDocument();
      expect(screen.getByText('Cannot remove the last admin')).toBeInTheDocument();
    });

    it('disables all Remove buttons while a remove is in progress', () => {
      mockRemoveMember({ submitting: true });
      mockMembersLoaded([MEMBER_REGULAR, MEMBER_ADMIN]);
      render(<MembersPage communityId="comm-1" />);

      const removeButtons = screen.getAllByRole('button', { name: /Remove/ });
      for (const btn of removeButtons) {
        expect(btn).toBeDisabled();
      }
    });
  });

  // ── Accessibility ───────────────────────────────────────────────────────────

  describe('accessibility', () => {
    it('provides an accessible name for the add-member form', () => {
      render(<MembersPage communityId="comm-1" />);

      expect(screen.getByRole('form', { name: 'Add member' })).toBeInTheDocument();
    });

    it('has aria-required on the Stellar address input', () => {
      render(<MembersPage communityId="comm-1" />);

      const input = screen.getByLabelText(/Stellar address/i);
      expect(input).toHaveAttribute('aria-required');
    });

    it('associates the field error message with the input via aria-describedby', async () => {
      const user = userEvent.setup();
      render(<MembersPage communityId="comm-1" />);

      await user.type(screen.getByLabelText(/Stellar address/i), 'bad');
      await user.click(screen.getByRole('button', { name: 'Add member' }));

      const input = screen.getByLabelText(/Stellar address/i);
      const errorId = input.getAttribute('aria-describedby');
      expect(errorId).toBeTruthy();

      const errorEl = document.getElementById(errorId!);
      expect(errorEl).toBeInTheDocument();
      expect(errorEl!.textContent).toMatch(/valid Stellar public key/i);
    });

    it('uses <time> elements to mark up the joined date', () => {
      mockMembersLoaded([MEMBER_REGULAR]);
      render(<MembersPage communityId="comm-1" />);

      const timeEl = document.querySelector('time');
      expect(timeEl).toBeInTheDocument();
      expect(timeEl).toHaveAttribute('dateTime', MEMBER_REGULAR.joined_at);
    });

    it('the member list is a <ul> element with a descriptive label', () => {
      render(<MembersPage communityId="comm-1" />);

      const list = screen.getByRole('list', { name: 'Community members' });
      expect(list.tagName).toBe('UL');
    });
  });
});
