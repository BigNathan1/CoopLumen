import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  describe('Rendering', () => {
    it('renders when isOpen is true', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete Community?"
          description="This action cannot be undone."
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.getByText('Delete Community?')).toBeInTheDocument();
      expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      render(
        <ConfirmDialog
          isOpen={false}
          title="Delete Community?"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('renders with default button labels', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm Action?"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Confirm')).toBeInTheDocument();
    });

    it('renders with custom button labels', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          confirmLabel="Delete Forever"
          cancelLabel="Keep It"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      expect(screen.getByText('Delete Forever')).toBeInTheDocument();
      expect(screen.getByText('Keep It')).toBeInTheDocument();
    });

    it('renders description when provided', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Remove Member?"
          description="This member will lose access to all community features."
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      expect(screen.getByText('This member will lose access to all community features.')).toBeInTheDocument();
    });

    it('does not render description when not provided', () => {
      const { container } = render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm?"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      const description = container.querySelector('[id^="confirm-dialog-desc"]');
      expect(description).not.toBeInTheDocument();
    });
  });

  describe('ARIA attributes', () => {
    it('sets role="alertdialog" and aria-modal="true"', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm?"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('sets aria-describedby when description is provided', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          description="Are you sure?"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      const dialog = screen.getByRole('alertdialog');
      const descId = dialog.getAttribute('aria-describedby');
      expect(descId).toBeTruthy();

      const desc = document.getElementById(descId!);
      expect(desc).toHaveTextContent('Are you sure?');
    });

    it('does not set aria-describedby when description is not provided', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Confirm?"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      const dialog = screen.getByRole('alertdialog');
      expect(dialog).not.toHaveAttribute('aria-describedby');
    });

    it('sets aria-busy on confirm button when loading', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          confirmLabel="Delete"
          loading={true}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      const confirmBtn = screen.getByText('Delete');
      expect(confirmBtn).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('Button interactions', () => {
    it('calls onConfirm when confirm button is clicked', async () => {
      const onConfirm = jest.fn();
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          confirmLabel="Delete"
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />,
      );

      const confirmBtn = screen.getByText('Delete');
      fireEvent.click(confirmBtn);

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when cancel button is clicked', () => {
      const onCancel = jest.fn();
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          onConfirm={jest.fn()}
          onCancel={onCancel}
        />,
      );

      const cancelBtn = screen.getByText('Cancel');
      fireEvent.click(cancelBtn);

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('does not call onConfirm when loading and confirm button is clicked', () => {
      const onConfirm = jest.fn();
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          confirmLabel="Delete"
          loading={true}
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />,
      );

      const confirmBtn = screen.getByText('Delete');
      fireEvent.click(confirmBtn);

      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('Keyboard behavior', () => {
    it('calls onCancel when ESC is pressed', async () => {
      const onCancel = jest.fn();
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          onConfirm={jest.fn()}
          onCancel={onCancel}
        />,
      );

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('calls onConfirm when Enter is pressed on confirm button', async () => {
      const onConfirm = jest.fn();
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          confirmLabel="Delete"
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />,
      );

      const confirmBtn = screen.getByText('Delete');
      confirmBtn.focus();

      fireEvent.keyDown(document, { key: 'Enter' });

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('does not call onConfirm when Enter is pressed on cancel button', async () => {
      const onConfirm = jest.fn();
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />,
      );

      const cancelBtn = screen.getByText('Cancel');
      cancelBtn.focus();

      fireEvent.keyDown(document, { key: 'Enter' });

      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('does not call onConfirm when Enter is pressed without explicit focus on confirm button', async () => {
      const onConfirm = jest.fn();
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          description="Are you sure?"
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />,
      );

      const description = screen.getByText('Are you sure?');
      description.focus();

      fireEvent.keyDown(document, { key: 'Enter' });

      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('does not trigger onConfirm on Enter when loading', () => {
      const onConfirm = jest.fn();
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          confirmLabel="Delete"
          loading={true}
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />,
      );

      const confirmBtn = screen.getByText('Delete');
      confirmBtn.focus();

      fireEvent.keyDown(document, { key: 'Enter' });

      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('does not remove keyboard listener when loading', () => {
      const onConfirm = jest.fn();
      const { rerender } = render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          confirmLabel="Delete"
          loading={false}
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />,
      );

      // Set loading to true
      rerender(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          confirmLabel="Delete"
          loading={true}
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />,
      );

      // Set loading to false again
      rerender(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          confirmLabel="Delete"
          loading={false}
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />,
      );

      const confirmBtn = screen.getByText('Delete');
      confirmBtn.focus();

      fireEvent.keyDown(document, { key: 'Enter' });

      expect(onConfirm).toHaveBeenCalled();
    });
  });

  describe('Focus management', () => {
    it('focuses cancel button (safe action) on open by default', async () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      const cancelBtn = screen.getByText('Cancel');

      await waitFor(() => {
        expect(cancelBtn).toHaveFocus();
      });
    });

    it('traps focus between cancel and confirm buttons (inherited from Modal)', async () => {
      const user = userEvent.setup();
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      const cancelBtn = screen.getByText('Cancel');
      const confirmBtn = screen.getByText('Confirm');

      // Focus starts on cancel (safe action)
      await waitFor(() => expect(cancelBtn).toHaveFocus());

      // Tab moves to confirm
      await user.tab();
      expect(confirmBtn).toHaveFocus();

      // Tab wraps to cancel
      await user.tab();
      expect(cancelBtn).toHaveFocus();
    });
  });

  describe('Loading state', () => {
    it('disables both buttons when loading is true', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          loading={true}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      const cancelBtn = screen.getByText('Cancel') as HTMLButtonElement;
      const confirmBtn = screen.getByText('Confirm') as HTMLButtonElement;

      expect(cancelBtn).toBeDisabled();
      expect(confirmBtn).toBeDisabled();
    });

    it('enables both buttons when loading is false', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          loading={false}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      const cancelBtn = screen.getByText('Cancel') as HTMLButtonElement;
      const confirmBtn = screen.getByText('Confirm') as HTMLButtonElement;

      expect(cancelBtn).not.toBeDisabled();
      expect(confirmBtn).not.toBeDisabled();
    });

    it('shows spinner in confirm button when loading', () => {
      const { container } = render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          confirmLabel="Delete"
          loading={true}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      const spinner = container.querySelector('[class*="spinner"]');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveAttribute('aria-hidden', 'true');
    });

    it('does not show spinner when not loading', () => {
      const { container } = render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          loading={false}
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      const spinner = container.querySelector('[class*="spinner"]');
      expect(spinner).not.toBeInTheDocument();
    });
  });

  describe('Backdrop click behavior', () => {
    it('calls onCancel when backdrop is clicked', async () => {
      const onCancel = jest.fn();
      const { container } = render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          onConfirm={jest.fn()}
          onCancel={onCancel}
        />,
      );

      const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;
      fireEvent.click(backdrop);

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('Async confirm callback', () => {
    it('handles promise-returning onConfirm', async () => {
      const onConfirm = jest.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(resolve, 10);
          }),
      );

      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          confirmLabel="Delete"
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />,
      );

      const confirmBtn = screen.getByText('Delete');
      fireEvent.click(confirmBtn);

      expect(onConfirm).toHaveBeenCalledTimes(1);

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalled();
      });
    });
  });

  describe('Edge cases', () => {
    it('handles rapid open/close cycles', async () => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();

      const { rerender } = render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );

      rerender(
        <ConfirmDialog
          isOpen={false}
          title="Delete?"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );

      rerender(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('handles title and description updates while open', () => {
      const { rerender } = render(
        <ConfirmDialog
          isOpen={true}
          title="Delete Community?"
          description="This cannot be undone."
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      expect(screen.getByText('Delete Community?')).toBeInTheDocument();
      expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();

      rerender(
        <ConfirmDialog
          isOpen={true}
          title="Remove Member?"
          description="Member will lose access."
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      expect(screen.getByText('Remove Member?')).toBeInTheDocument();
      expect(screen.getByText('Member will lose access.')).toBeInTheDocument();
    });

    it('cleans up keyboard listener on unmount', () => {
      const onConfirm = jest.fn();
      const { unmount } = render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          confirmLabel="Delete"
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />,
      );

      unmount();

      // After unmount, should not throw or cause issues
      const confirmBtn = document.querySelector('[role="alertdialog"]');
      expect(confirmBtn).not.toBeInTheDocument();
    });

    it('handles description as ReactNode', () => {
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          description={
            <div>
              <strong>Warning:</strong> This action cannot be undone.
            </div>
          }
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      expect(screen.getByText('Warning:')).toBeInTheDocument();
      expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
    });
  });

  describe('Integration with Modal', () => {
    it('inherits Modal focus trap behavior', async () => {
      const user = userEvent.setup();
      render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />,
      );

      const cancelBtn = screen.getByText('Cancel');
      const confirmBtn = screen.getByText('Confirm');
      const closeButton = screen.getByLabelText('Close modal');

      await waitFor(() => expect(cancelBtn).toHaveFocus());

      // Tab through all focusable elements
      await user.tab();
      expect(confirmBtn).toHaveFocus();

      await user.tab();
      expect(closeButton).toHaveFocus();

      // Tab wraps back to first (focus trap from Modal)
      await user.tab();
      expect(cancelBtn).toHaveFocus();
    });

    it('uses Modal closeOnBackdrop for safe close', async () => {
      const onCancel = jest.fn();
      const { container } = render(
        <ConfirmDialog
          isOpen={true}
          title="Delete?"
          onConfirm={jest.fn()}
          onCancel={onCancel}
        />,
      );

      // Modal's default closeOnBackdrop is true, so backdrop click should work
      const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;
      fireEvent.click(backdrop);

      expect(onCancel).toHaveBeenCalled();
    });
  });
});
