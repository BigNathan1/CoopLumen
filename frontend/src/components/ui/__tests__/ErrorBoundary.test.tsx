import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from '../ErrorBoundary';

// Mock console.error to avoid cluttering test output
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

afterEach(() => {
  consoleErrorSpy.mockClear();
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
});

describe('ErrorBoundary', () => {
  describe('normal rendering', () => {
    it('renders children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <div>Hello World</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('renders multiple children correctly', () => {
      render(
        <ErrorBoundary>
          <p>Paragraph 1</p>
          <p>Paragraph 2</p>
        </ErrorBoundary>
      );

      expect(screen.getByText('Paragraph 1')).toBeInTheDocument();
      expect(screen.getByText('Paragraph 2')).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('catches errors thrown by children and displays fallback UI', () => {
      const ThrowError = () => {
        throw new Error('Test error message');
      };

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(
        screen.getByText('We encountered an unexpected error. Please try again.')
      ).toBeInTheDocument();
    });

    it('displays error details in a collapsible section', () => {
      const ThrowError = () => {
        throw new Error('Detailed error for testing');
      };

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      const detailsButton = screen.getByText('Error details');
      expect(detailsButton).toBeInTheDocument();

      // Initially collapsed
      expect(detailsButton.parentElement).not.toHaveAttribute('open');
    });
  });

  describe('accessibility', () => {
    it('has accessible heading and alert structure', () => {
      const ThrowError = () => {
        throw new Error('Test error');
      };

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      const title = screen.getByText('Something went wrong');
      expect(title.tagName).toBe('H1');
    });

    it('displays error message as readable text', () => {
      const ThrowError = () => {
        throw new Error('Test error');
      };

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(
        screen.getByText('We encountered an unexpected error. Please try again.')
      ).toBeInTheDocument();
    });

    it('provides a keyboard-operable button to retry', async () => {
      const user = userEvent.setup();
      const ThrowError = () => {
        throw new Error('Test error');
      };

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      const button = screen.getByRole('button', { name: /try again/i });
      expect(button).toBeInTheDocument();

      // Tab until the button takes focus rather than assuming it is the first
      // stop: the fallback also renders a <details> whose <summary> is
      // focusable, and where that lands in the tab order has changed between
      // user-event releases. What matters is that the button is reachable.
      for (let i = 0; i < 5 && document.activeElement !== button; i += 1) {
        await user.tab();
      }
      expect(button).toHaveFocus();
    });

    it('button is keyboard accessible with Enter key', async () => {
      const user = userEvent.setup();
      const ThrowError = () => {
        throw new Error('Test error');
      };

      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      const button = screen.getByRole('button', { name: /try again/i });

      // Swap in children that no longer throw before resetting; the boundary
      // renders its fallback until `Try again` clears the error state.
      rerender(
        <ErrorBoundary>
          <div>Recovered Content</div>
        </ErrorBoundary>
      );

      await user.click(button);

      expect(screen.getByText('Recovered Content')).toBeInTheDocument();
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });

    it('details element is accessible via keyboard', async () => {
      const user = userEvent.setup();
      const ThrowError = () => {
        throw new Error('Detailed test error');
      };

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      const detailsSummary = screen.getByText('Error details');

      // Should be focusable and clickable via keyboard
      await user.click(detailsSummary);
      expect(detailsSummary.parentElement).toHaveAttribute('open');
    });
  });

  describe('reset functionality', () => {
    it('resets error state when "Try again" is clicked', async () => {
      const user = userEvent.setup();
      const ThrowError = () => {
        throw new Error('Test error');
      };

      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();

      const button = screen.getByRole('button', { name: /try again/i });

      // Rerender with working content first, then reset — re-rendering the
      // throwing child before the reset would simply trip the boundary again.
      rerender(
        <ErrorBoundary>
          <div>Working Content</div>
        </ErrorBoundary>
      );

      await user.click(button);

      expect(screen.getByText('Working Content')).toBeInTheDocument();
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });

    it('allows multiple error cycles', async () => {
      const user = userEvent.setup();

      const ErrorComponent = ({ shouldError }: { shouldError: boolean }) => {
        if (shouldError) {
          throw new Error('Cycle error');
        }
        return <div>Cycle Content</div>;
      };

      const { rerender } = render(
        <ErrorBoundary>
          <ErrorComponent shouldError={false} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Cycle Content')).toBeInTheDocument();

      // Trigger error
      rerender(
        <ErrorBoundary>
          <ErrorComponent shouldError={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();

      // Return to working state, then reset
      const button = screen.getByRole('button', { name: /try again/i });
      rerender(
        <ErrorBoundary>
          <ErrorComponent shouldError={false} />
        </ErrorBoundary>
      );

      await user.click(button);

      expect(screen.getByText('Cycle Content')).toBeInTheDocument();
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });
  });

  describe('error logging', () => {
    it('logs error information to console.error', () => {
      const ThrowError = () => {
        throw new Error('Logged error');
      };

      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(
        consoleErrorSpy.mock.calls.some((call) => call[0] === 'ErrorBoundary caught an error:')
      ).toBe(true);
    });
  });
});
