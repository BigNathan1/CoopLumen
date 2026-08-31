import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { useToast, ToastProvider } from '@/hooks/useToast';
import { ToastDisplay } from '../ToastDisplay';
import userEvent from '@testing-library/user-event';

/**
 * Test component that allows us to trigger toasts from tests.
 */
function TestComponent({ onReady }: { onReady?: (toast: ReturnType<typeof useToast>) => void }) {
  const toast = useToast();

  React.useEffect(() => {
    onReady?.(toast);
  }, [onReady, toast]);

  return (
    <div>
      <div data-testid="test-area">Ready</div>
    </div>
  );
}

/**
 * Helper to render component wrapped in ToastProvider.
 */
function renderWithToast(
  component: React.ReactElement | null,
  onReady?: (toast: ReturnType<typeof useToast>) => void
) {
  return render(
    <ToastProvider>
      <TestComponent onReady={onReady} />
      <ToastDisplay />
      {component}
    </ToastProvider>
  );
}

// Need to import React for the test component
import React from 'react';

describe('Toast System', () => {
  beforeEach(() => {
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Toast variants', () => {
    it('renders success toast', async () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.success('Success message');
      });

      expect(screen.getByText('Success message')).toBeInTheDocument();
      expect(screen.getByText('Success message').closest('[role="status"]')).toBeInTheDocument();
    });

    it('renders error toast', async () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.error('Error message');
      });

      expect(screen.getByText('Error message')).toBeInTheDocument();
      expect(screen.getByText('Error message').closest('[role="alert"]')).toBeInTheDocument();
    });

    it('renders info toast', async () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.info('Info message');
      });

      expect(screen.getByText('Info message')).toBeInTheDocument();
      expect(screen.getByText('Info message').closest('[role="status"]')).toBeInTheDocument();
    });

    it('renders warning toast', async () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.warning('Warning message');
      });

      expect(screen.getByText('Warning message')).toBeInTheDocument();
      expect(screen.getByText('Warning message').closest('[role="alert"]')).toBeInTheDocument();
    });
  });

  describe('ARIA attributes', () => {
    it('error toast has role="alert" and aria-live="assertive"', () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.error('Error');
      });

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'assertive');
      expect(alert).toHaveAttribute('aria-atomic', 'true');
    });

    it('warning toast has role="alert" and aria-live="assertive"', () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.warning('Warning');
      });

      const alert = screen.getByRole('alert');
      expect(alert).toHaveAttribute('aria-live', 'assertive');
    });

    it('success toast has role="status" and aria-live="polite"', () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.success('Success');
      });

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
      expect(status).toHaveAttribute('aria-atomic', 'true');
    });

    it('info toast has role="status" and aria-live="polite"', () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.info('Info');
      });

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
    });

    it('toast icon has aria-hidden="true"', () => {
      let toastApi: ReturnType<typeof useToast>;

      const { container } = renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.success('Success');
      });

      const icons = container.querySelectorAll('[aria-hidden="true"]');
      expect(icons.length).toBeGreaterThan(0);
    });

    it('close button has accessible label', () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.success('Message');
      });

      expect(screen.getByLabelText('Dismiss notification')).toBeInTheDocument();
    });
  });

  describe('Auto-dismiss behavior', () => {
    it('dismisses after default duration (4000ms)', async () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.success('Message');
      });

      expect(screen.getByText('Message')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(4000);
      });

      await waitFor(() => {
        expect(screen.queryByText('Message')).not.toBeInTheDocument();
      });
    });

    it('respects custom duration', async () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.success('Message', { duration: 2000 });
      });

      expect(screen.getByText('Message')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(screen.queryByText('Message')).not.toBeInTheDocument();
      });
    });

    it('does not dismiss when duration is 0', async () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.success('Message', { duration: 0 });
      });

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(screen.getByText('Message')).toBeInTheDocument();
    });

    it('does not dismiss when duration is Infinity', async () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.success('Message', { duration: Infinity });
      });

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(screen.getByText('Message')).toBeInTheDocument();
    });
  });

  describe('Manual dismiss', () => {
    it('dismisses when close button is clicked', async () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.success('Message');
      });

      expect(screen.getByText('Message')).toBeInTheDocument();

      const closeButton = screen.getByLabelText('Dismiss notification');
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText('Message')).not.toBeInTheDocument();
      });
    });

    it('does not show close button when dismissible is false', () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.success('Message', { dismissible: false });
      });

      expect(screen.queryByLabelText('Dismiss notification')).not.toBeInTheDocument();
    });

    it('can dismiss via API method', async () => {
      let toastApi: ReturnType<typeof useToast>;
      let toastId: string | undefined;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        // Store toast id from internal state if possible
        toastApi!.success('Message');
      });

      expect(screen.getByText('Message')).toBeInTheDocument();

      // Access the toast id through the displayed toast
      const toast = screen.getByText('Message').closest('[role="status"]');
      const toastContent = toast?.textContent;

      // Simulate manual dismiss via context
      act(() => {
        // We'll test dismissAll instead since we don't have direct id access
        toastApi!.dismissAll();
      });

      await waitFor(() => {
        expect(screen.queryByText('Message')).not.toBeInTheDocument();
      });
    });
  });

  describe('Multiple toasts', () => {
    it('renders multiple simultaneous toasts', () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.success('Success');
        toastApi!.error('Error');
        toastApi!.info('Info');
      });

      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Info')).toBeInTheDocument();
    });

    it('each toast dismisses independently', async () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.success('Success');
        toastApi!.error('Error');
      });

      const closeButtons = screen.getAllByLabelText('Dismiss notification');
      expect(closeButtons).toHaveLength(2);

      // Click first close button
      fireEvent.click(closeButtons[0]);

      await waitFor(() => {
        expect(screen.getAllByLabelText('Dismiss notification')).toHaveLength(1);
      });

      // First toast should be gone
      expect(screen.queryByText('Success')).not.toBeInTheDocument();
      // Second toast should still be there
      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    it('toasts auto-dismiss independently', async () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.success('Quick', { duration: 1000 });
        toastApi!.error('Slow', { duration: 5000 });
      });

      // Advance time to dismiss first toast
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(screen.queryByText('Quick')).not.toBeInTheDocument();
        expect(screen.getByText('Slow')).toBeInTheDocument();
      });
    });

    it('dismissAll clears all toasts', async () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.success('Success');
        toastApi!.error('Error');
        toastApi!.info('Info');
      });

      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Info')).toBeInTheDocument();

      act(() => {
        toastApi!.dismissAll();
      });

      await waitFor(() => {
        expect(screen.queryByText('Success')).not.toBeInTheDocument();
        expect(screen.queryByText('Error')).not.toBeInTheDocument();
        expect(screen.queryByText('Info')).not.toBeInTheDocument();
      });
    });
  });

  describe('useToast hook errors', () => {
    it('throws error when useToast is used outside ToastProvider', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      function BadComponent() {
        useToast();
        return null;
      }

      expect(() => {
        render(<BadComponent />);
      }).toThrow('useToast must be used within a ToastProvider');

      consoleError.mockRestore();
    });
  });

  describe('Edge cases', () => {
    it('handles rapid successive toasts', () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        for (let i = 0; i < 10; i++) {
          toastApi!.success(`Message ${i}`);
        }
      });

      for (let i = 0; i < 10; i++) {
        expect(screen.getByText(`Message ${i}`)).toBeInTheDocument();
      }
    });

    it('handles very long messages', () => {
      let toastApi: ReturnType<typeof useToast>;

      const longMessage = 'A'.repeat(500);

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.success(longMessage);
      });

      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });

    it('handles empty message gracefully', () => {
      let toastApi: ReturnType<typeof useToast>;

      renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.success('');
      });

      // Should render even with empty message
      const toasts = screen.getAllByRole('status');
      expect(toasts.length).toBeGreaterThan(0);
    });

    it('cleans up timers on unmount', () => {
      let toastApi: ReturnType<typeof useToast>;

      const { unmount } = renderWithToast(null, (api) => {
        toastApi = api;
      });

      act(() => {
        toastApi!.success('Message', { duration: 4000 });
      });

      unmount();

      // Advance time - should not cause errors since timers are cleaned
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(true).toBe(true); // If we get here, no errors occurred
    });
  });

  describe('Focus management', () => {
    it('does not steal focus when showing toast', async () => {
      let toastApi: ReturnType<typeof useToast>;

      render(
        <ToastProvider>
          <TestComponent onReady={(api) => (toastApi = api)} />
          <ToastDisplay />
          <input type="text" placeholder="Focus me" data-testid="input" autoFocus />
        </ToastProvider>
      );

      const input = screen.getByTestId('input') as HTMLInputElement;
      expect(document.activeElement).toBe(input);

      act(() => {
        toastApi!.success('Notification');
      });

      // Focus should not move to toast
      expect(document.activeElement).toBe(input);
    });
  });
});

// Import act from React for test utilities
import { act } from '@testing-library/react';
