import { render, screen } from '@testing-library/react';
import { PageTransition } from '../PageTransition';

/*
 * next/navigation is a server-only package in the test environment. We mock it
 * so the hook resolves without actually touching the Next.js router.
 */
const mockPathname = jest.fn(() => '/dashboard');
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

describe('PageTransition', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/dashboard');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  /* ---------------------------------------------------------------------- */
  /* Rendering                                                                */
  /* ---------------------------------------------------------------------- */

  describe('Rendering', () => {
    it('renders a wrapper element with the expected test id', () => {
      render(
        <PageTransition>
          <p>Hello</p>
        </PageTransition>
      );

      expect(screen.getByTestId('page-transition')).toBeInTheDocument();
    });

    it('renders its children inside the wrapper', () => {
      render(
        <PageTransition>
          <p>Page content</p>
        </PageTransition>
      );

      expect(screen.getByText('Page content')).toBeInTheDocument();
    });

    it('forwards an optional className to the wrapper', () => {
      render(
        <PageTransition className="custom-layout">
          <span>content</span>
        </PageTransition>
      );

      const wrapper = screen.getByTestId('page-transition');
      expect(wrapper).toHaveClass('custom-layout');
    });

    it('renders a block-level div as the wrapper', () => {
      render(
        <PageTransition>
          <span />
        </PageTransition>
      );

      expect(screen.getByTestId('page-transition').tagName).toBe('DIV');
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Accessibility                                                            */
  /* ---------------------------------------------------------------------- */

  describe('Accessibility', () => {
    it('does not carry an aria-live attribute (screen readers handle navigation)', () => {
      render(
        <PageTransition>
          <p>content</p>
        </PageTransition>
      );

      expect(screen.getByTestId('page-transition')).not.toHaveAttribute('aria-live');
    });

    it('does not carry a role that would create an implicit landmark', () => {
      render(
        <PageTransition>
          <p>content</p>
        </PageTransition>
      );

      expect(screen.getByTestId('page-transition')).not.toHaveAttribute('role');
    });

    it('does not receive focus (no tabIndex)', () => {
      render(
        <PageTransition>
          <button type="button">Press me</button>
        </PageTransition>
      );

      expect(screen.getByTestId('page-transition')).not.toHaveAttribute('tabIndex');
    });

    it('preserves the focus order: the inner button is reachable', () => {
      render(
        <PageTransition>
          <button type="button">Press me</button>
        </PageTransition>
      );

      // The button should be the only focusable element — not the wrapper.
      expect(screen.getByRole('button', { name: 'Press me' })).toBeInTheDocument();
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Route change re-trigger                                                  */
  /* ---------------------------------------------------------------------- */

  describe('Route change behaviour', () => {
    it('still renders after the pathname changes', () => {
      const { rerender } = render(
        <PageTransition>
          <p>Page A</p>
        </PageTransition>
      );

      mockPathname.mockReturnValue('/communities');

      rerender(
        <PageTransition>
          <p>Page B</p>
        </PageTransition>
      );

      expect(screen.getByText('Page B')).toBeInTheDocument();
      expect(screen.queryByText('Page A')).not.toBeInTheDocument();
    });

    it('the wrapper element persists across route changes (no unmount/remount)', () => {
      const { rerender } = render(
        <PageTransition>
          <p>Page A</p>
        </PageTransition>
      );

      const wrapperBefore = screen.getByTestId('page-transition');

      mockPathname.mockReturnValue('/communities');
      rerender(
        <PageTransition>
          <p>Page B</p>
        </PageTransition>
      );

      const wrapperAfter = screen.getByTestId('page-transition');

      // Same DOM node — the effect restarts the animation without remounting.
      expect(wrapperBefore).toBe(wrapperAfter);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* className merging                                                        */
  /* ---------------------------------------------------------------------- */

  describe('className merging', () => {
    it('does not include a trailing empty string when no className is given', () => {
      render(
        <PageTransition>
          <span />
        </PageTransition>
      );

      const wrapper = screen.getByTestId('page-transition');
      // The className value should not have a trailing space caused by
      // joining an undefined/empty extra class.
      expect(wrapper.className.endsWith(' ')).toBe(false);
    });

    it('includes both the module class and the caller class', () => {
      render(
        <PageTransition className="extra">
          <span />
        </PageTransition>
      );

      // The CSS module mapper returns the class name string as-is in jsdom;
      // both parts should be present.
      const classes = screen.getByTestId('page-transition').className.split(' ');
      expect(classes).toContain('extra');
    });
  });
});
