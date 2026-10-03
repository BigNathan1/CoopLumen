import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddMemberForm } from '../AddMemberForm';

/** A syntactically valid Stellar account, as the address schema accepts. */
const MEMBER = `G${'A'.repeat(55)}`;
const OTHER_MEMBER = `G${'B'.repeat(55)}`;

/** The combobox trigger the `Select` primitive renders for a labelled field. */
function roleTrigger(label: RegExp) {
  return screen.getByRole('combobox', { name: label });
}

describe('AddMemberForm', () => {
  it('renders a Stellar address field and a role selector', () => {
    render(<AddMemberForm onSubmit={jest.fn()} />);

    expect(screen.getByLabelText(/stellar address/i)).toBeInTheDocument();
    expect(roleTrigger(/role/i)).toBeInTheDocument();
  });

  it('submits the address with the default member role', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<AddMemberForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/stellar address/i), MEMBER);
    await user.click(screen.getByRole('button', { name: /add member/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ stellarAddress: MEMBER, role: 'member' })
    );
  });

  it('submits the role chosen in the selector', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<AddMemberForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/stellar address/i), MEMBER);
    await user.click(roleTrigger(/role/i));
    await user.click(screen.getByRole('option', { name: 'Treasurer' }));
    await user.click(screen.getByRole('button', { name: /add member/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ stellarAddress: MEMBER, role: 'treasurer' })
    );
  });

  it('trims whitespace from a pasted address', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<AddMemberForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/stellar address/i), `  ${MEMBER}  `);
    await user.click(screen.getByRole('button', { name: /add member/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ stellarAddress: MEMBER, role: 'member' })
    );
  });

  it('confirms the addition and clears the address', async () => {
    const user = userEvent.setup();
    render(<AddMemberForm onSubmit={jest.fn().mockResolvedValue(undefined)} />);

    await user.type(screen.getByLabelText(/stellar address/i), MEMBER);
    await user.click(screen.getByRole('button', { name: /add member/i }));

    expect(await screen.findByText(/now belongs to this community/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/stellar address/i)).toHaveValue('');
  });

  describe('validation', () => {
    it('reports an address that is not a Stellar public key', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn();
      render(<AddMemberForm onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText(/stellar address/i), 'not-an-address');
      await user.click(screen.getByRole('button', { name: /add member/i }));

      expect(
        await screen.findByText('Enter a valid Stellar public key (starts with G, 56 characters)')
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('requires an address', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn();
      render(<AddMemberForm onSubmit={onSubmit} />);

      await user.click(screen.getByRole('button', { name: /add member/i }));

      expect(await screen.findByText('Stellar address is required')).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('flags the invalid field with aria-invalid', async () => {
      const user = userEvent.setup();
      render(<AddMemberForm onSubmit={jest.fn()} />);

      await user.click(screen.getByRole('button', { name: /add member/i }));

      await waitFor(() =>
        expect(screen.getByLabelText(/stellar address/i)).toHaveAttribute('aria-invalid', 'true')
      );
    });
  });

  describe('existing members', () => {
    it('warns politely when the address is already a member', async () => {
      const user = userEvent.setup();
      render(<AddMemberForm onSubmit={jest.fn()} existingAddresses={[OTHER_MEMBER]} />);

      await user.type(screen.getByLabelText(/stellar address/i), OTHER_MEMBER);

      const warning = await screen.findByText(/already a member/i);
      // Polite, not assertive: it appears mid-typing and must not interrupt.
      expect(warning.closest('[role="status"]')).not.toBeNull();
    });

    it('does not warn about an address that is not a member', async () => {
      const user = userEvent.setup();
      render(<AddMemberForm onSubmit={jest.fn()} existingAddresses={[OTHER_MEMBER]} />);

      await user.type(screen.getByLabelText(/stellar address/i), MEMBER);

      await waitFor(() => expect(screen.queryByText(/already a member/i)).not.toBeInTheDocument());
    });
  });

  describe('failures', () => {
    it('announces the reason a rejected submission gave and keeps the address', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn().mockRejectedValue(new Error('Only an admin can do that.'));
      render(<AddMemberForm onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText(/stellar address/i), MEMBER);
      await user.click(screen.getByRole('button', { name: /add member/i }));

      expect(await screen.findByText('Only an admin can do that.')).toBeInTheDocument();
      expect(screen.getByLabelText(/stellar address/i)).toHaveValue(MEMBER);
    });

    it('falls back to a generic message when the rejection carries none', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn().mockRejectedValue(new Error(''));
      render(<AddMemberForm onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText(/stellar address/i), MEMBER);
      await user.click(screen.getByRole('button', { name: /add member/i }));

      expect(
        await screen.findByText('Could not add this member. Please try again.')
      ).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('associates both labels with their controls', () => {
      render(<AddMemberForm onSubmit={jest.fn()} />);

      expect(screen.getByLabelText(/stellar address/i).tagName).toBe('INPUT');
      expect(roleTrigger(/role/i)).toHaveAttribute('aria-haspopup', 'listbox');
    });

    it('describes the address field with its hint and its error', async () => {
      const user = userEvent.setup();
      render(<AddMemberForm onSubmit={jest.fn()} />);

      /** Every element `describedBy` points at, resolved to text. */
      const describedText = (control: HTMLElement) =>
        (control.getAttribute('aria-describedby') ?? '')
          .split(/\s+/)
          .filter(Boolean)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ');

      const address = screen.getByLabelText(/stellar address/i);
      expect(describedText(address)).toContain('starting with G');

      await user.click(screen.getByRole('button', { name: /add member/i }));
      await waitFor(() => expect(describedText(address)).toContain('Stellar address is required'));
    });

    it('marks the required field and hides the asterisk from assistive tech', () => {
      render(<AddMemberForm onSubmit={jest.fn()} />);

      expect(screen.getByLabelText(/stellar address/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
    });

    it('reaches the controls by tabbing in source order', async () => {
      const user = userEvent.setup();
      render(<AddMemberForm onSubmit={jest.fn()} />);

      await user.tab();
      expect(screen.getByLabelText(/stellar address/i)).toHaveFocus();

      await user.tab();
      expect(roleTrigger(/role/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', { name: /add member/i })).toHaveFocus();
    });

    it('chooses a role from the keyboard alone', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      render(<AddMemberForm onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText(/stellar address/i), MEMBER);

      roleTrigger(/role/i).focus();
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{ArrowDown}');
      await user.keyboard('{Enter}');

      expect(roleTrigger(/role/i)).toHaveTextContent('Admin');

      await user.click(screen.getByRole('button', { name: /add member/i }));
      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({ stellarAddress: MEMBER, role: 'admin' })
      );
    });

    it('submits from the keyboard', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      render(<AddMemberForm onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText(/stellar address/i), MEMBER);
      // Two tabs, not one: the role trigger sits between the field and the
      // button, and Enter on the trigger opens the list rather than submitting.
      await user.tab();
      await user.tab();
      await user.keyboard('{Enter}');

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    });

    it('disables the controls while submitting', () => {
      render(<AddMemberForm onSubmit={jest.fn()} isLoading />);

      expect(screen.getByRole('button', { name: /add member/i })).toBeDisabled();
      expect(screen.getByLabelText(/stellar address/i)).toBeDisabled();
    });
  });
});
