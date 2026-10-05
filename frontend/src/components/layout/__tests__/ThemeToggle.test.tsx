import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '../ThemeToggle';
import { ThemeProvider } from '@/hooks/useTheme';
import { THEME_STORAGE_KEY } from '@/lib/theme';

/** jsdom ships no `matchMedia`; the toggle only needs it to report a preference. */
function mockMatchMedia(matches: boolean) {
  window.matchMedia = jest.fn().mockReturnValue({
    matches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }) as unknown as typeof window.matchMedia;
}

function renderToggle(props: Parameters<typeof ThemeToggle>[0] = {}) {
  return render(
    <ThemeProvider>
      <ThemeToggle {...props} />
    </ThemeProvider>
  );
}

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = '';
  mockMatchMedia(false);
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  jest.restoreAllMocks();
});

describe('ThemeToggle', () => {
  describe('Rendering', () => {
    it('renders a button', () => {
      renderToggle();

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('offers to switch to dark while the light theme is active', () => {
      renderToggle();

      expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument();
    });

    it('offers to switch to light while the dark theme is active', () => {
      mockMatchMedia(true);
      renderToggle();

      expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
    });

    it('renders an icon that is hidden from assistive technology', () => {
      const { container } = renderToggle();

      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).toHaveAttribute('focusable', 'false');
    });

    it('shows a sun in dark mode and a moon in light mode', () => {
      const { container, unmount } = renderToggle();
      expect(container.querySelector('svg circle')).not.toBeInTheDocument();
      unmount();

      mockMatchMedia(true);
      const dark = renderToggle();
      expect(dark.container.querySelector('svg circle')).toBeInTheDocument();
    });

    it('hides the target theme label by default', () => {
      renderToggle();

      expect(screen.queryByText('dark')).not.toBeInTheDocument();
    });

    it('renders the target theme label when asked', () => {
      renderToggle({ showLabel: true });

      expect(screen.getByText('dark')).toBeInTheDocument();
    });

    it('appends a caller className to its own', () => {
      renderToggle({ className: 'custom-toggle' });

      expect(screen.getByRole('button')).toHaveClass('custom-toggle');
    });

    it('does not submit a surrounding form', () => {
      renderToggle();

      expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
    });
  });

  describe('Toggling', () => {
    it('switches to dark on click', async () => {
      const user = userEvent.setup();
      renderToggle();

      await user.click(screen.getByRole('button'));

      expect(document.documentElement).toHaveClass('dark');
      expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
    });

    it('switches back to light on a second click', async () => {
      const user = userEvent.setup();
      renderToggle();

      await user.click(screen.getByRole('button'));
      await user.click(screen.getByRole('button'));

      expect(document.documentElement).toHaveClass('light');
      expect(document.documentElement).not.toHaveClass('dark');
    });

    it('persists the choice so it survives a reload', async () => {
      const user = userEvent.setup();
      renderToggle();

      await user.click(screen.getByRole('button'));

      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    });

    it('starts from the stored preference rather than the OS', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      renderToggle();

      expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('reports the dark theme through aria-pressed', async () => {
      const user = userEvent.setup();
      renderToggle();

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-pressed', 'false');

      await user.click(button);

      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    });

    it('carries a title matching its accessible name for pointer users', () => {
      renderToggle();

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', button.getAttribute('aria-label'));
    });

    it('announces the active theme through a polite live region', async () => {
      const user = userEvent.setup();
      renderToggle();

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
      expect(status).toHaveTextContent('Light theme');

      await user.click(screen.getByRole('button'));

      expect(screen.getByRole('status')).toHaveTextContent('Dark theme');
    });

    it('is reachable and operable with the keyboard', async () => {
      const user = userEvent.setup();
      renderToggle();

      await user.tab();
      expect(screen.getByRole('button')).toHaveFocus();

      await user.keyboard('{Enter}');
      expect(document.documentElement).toHaveClass('dark');

      await user.keyboard(' ');
      expect(document.documentElement).toHaveClass('light');
    });

    it('keeps focus on the button across a toggle', async () => {
      const user = userEvent.setup();
      renderToggle();

      const button = screen.getByRole('button');
      await user.click(button);

      expect(screen.getByRole('button')).toHaveFocus();
    });
  });

  describe('Provider requirement', () => {
    it('fails loudly when rendered outside a ThemeProvider', () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => render(<ThemeToggle />)).toThrow('useTheme must be used within a ThemeProvider');
    });
  });
});
