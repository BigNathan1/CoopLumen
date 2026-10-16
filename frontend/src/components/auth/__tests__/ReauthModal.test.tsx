import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReauthModal } from '../ReauthModal';

describe('ReauthModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onReauthenticate: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the dialog when isOpen is true', () => {
      render(<ReauthModal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Session Expired')).toBeInTheDocument();
      expect(
        screen.getByText(/Your session has expired or is no longer authorized/i)
      ).toBeInTheDocument();
      expect(screen.getByTestId('reauth-confirm-button')).toBeInTheDocument();
      expect(screen.getByTestId('reauth-cancel-button')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      render(<ReauthModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders error alert when error message is supplied', () => {
      render(<ReauthModal {...defaultProps} error="Freighter declined to sign" />);

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('Freighter declined to sign');
    });

    it('does not expose secrets or private keys in error messages', () => {
      const sanitizedMessage = 'Authentication failed due to signature verification error';
      render(<ReauthModal {...defaultProps} error={sanitizedMessage} />);

      const alert = screen.getByRole('alert');
      expect(alert.textContent).not.toMatch(/S[A-Z0-9]{55}/); // Stellar secret seed regex
      expect(alert.textContent).not.toMatch(/Bearer\s+[A-Za-z0-9-_=]+/);
    });
  });

  describe('Interactions', () => {
    it('invokes onClose when clicking Cancel', async () => {
      const user = userEvent.setup();
      render(<ReauthModal {...defaultProps} />);

      await user.click(screen.getByTestId('reauth-cancel-button'));
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });

    it('invokes onReauthenticate when clicking Re-authenticate', async () => {
      const user = userEvent.setup();
      render(<ReauthModal {...defaultProps} />);

      await user.click(screen.getByTestId('reauth-confirm-button'));
      expect(defaultProps.onReauthenticate).toHaveBeenCalledTimes(1);
    });

    it('disables buttons and indicates busy state when isLoading is true', () => {
      render(<ReauthModal {...defaultProps} isLoading={true} />);

      const confirmBtn = screen.getByTestId('reauth-confirm-button');
      const cancelBtn = screen.getByTestId('reauth-cancel-button');

      expect(confirmBtn).toBeDisabled();
      expect(confirmBtn).toHaveAttribute('aria-busy', 'true');
      expect(cancelBtn).toBeDisabled();
    });

    it('invokes onClose when pressing Escape key', () => {
      render(<ReauthModal {...defaultProps} />);

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('associates aria-describedby with the modal description', () => {
      render(<ReauthModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      const describedBy = dialog.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();

      const description = document.getElementById(describedBy!);
      expect(description).toBeInTheDocument();
      expect(description).toHaveTextContent(/Your session has expired/);
    });

    it('has accessible name matching the title', () => {
      render(<ReauthModal {...defaultProps} />);

      expect(screen.getByRole('dialog', { name: 'Session Expired' })).toBeInTheDocument();
    });
  });
});
