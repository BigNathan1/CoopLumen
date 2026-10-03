import { render, screen } from '@testing-library/react';
import { Breadcrumb, buildCrumbs } from '../Breadcrumb';
import type { BreadcrumbItem } from '../Breadcrumb';

// ---------------------------------------------------------------------------
// next/navigation mock — mutable so individual tests can set the pathname.
// ---------------------------------------------------------------------------
const mockState = { pathname: '/communities/comm-1/treasury' };

jest.mock('next/navigation', () => ({
  usePathname: () => mockState.pathname,
}));

// ---------------------------------------------------------------------------
// buildCrumbs unit tests — pure function, no DOM needed.
// ---------------------------------------------------------------------------
describe('buildCrumbs', () => {
  it('returns an empty array for the root path', () => {
    expect(buildCrumbs('/')).toEqual([]);
  });

  it('returns a Home crumb plus the single segment for a one-level path', () => {
    const crumbs = buildCrumbs('/dashboard');
    expect(crumbs).toEqual<BreadcrumbItem[]>([
      { label: 'Home', href: '/' },
      { label: 'Dashboard' }, // last crumb has no href
    ]);
  });

  it('gives the last crumb no href', () => {
    const crumbs = buildCrumbs('/communities/comm-1/treasury');
    expect(crumbs[crumbs.length - 1].href).toBeUndefined();
  });

  it('gives every intermediate crumb the correct accumulated href', () => {
    const crumbs = buildCrumbs('/communities/comm-1/treasury');
    expect(crumbs[0]).toEqual({ label: 'Home', href: '/' });
    expect(crumbs[1]).toEqual({ label: 'Communities', href: '/communities' });
    expect(crumbs[2]).toEqual({ label: 'comm-1', href: '/communities/comm-1' });
    expect(crumbs[3]).toEqual({ label: 'Treasury' });
  });

  it('maps every known segment to its human-readable label', () => {
    const known = [
      ['dashboard', 'Dashboard'],
      ['communities', 'Communities'],
      ['membership', 'Membership'],
      ['tokens', 'Tokens'],
      ['transactions', 'Transactions'],
      ['treasury', 'Treasury'],
      ['profile', 'Profile'],
      ['edit', 'Edit'],
    ] as const;

    for (const [segment, label] of known) {
      const crumbs = buildCrumbs(`/communities/${segment}`);
      // The labelled crumb is the last one (index 2).
      expect(crumbs[2].label).toBe(label);
    }
  });

  it('leaves an unknown segment exactly as it appears in the path', () => {
    const crumbs = buildCrumbs('/communities/my-custom-segment');
    expect(crumbs[2].label).toBe('my-custom-segment');
  });
});

// ---------------------------------------------------------------------------
// Breadcrumb component tests.
// ---------------------------------------------------------------------------
describe('Breadcrumb', () => {
  afterEach(() => {
    mockState.pathname = '/communities/comm-1/treasury';
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  it('renders a nav landmark with the default accessible label', () => {
    render(<Breadcrumb />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
  });

  it('accepts a custom aria-label', () => {
    render(<Breadcrumb aria-label="You are here" />);
    expect(screen.getByRole('navigation', { name: 'You are here' })).toBeInTheDocument();
  });

  it('renders an ordered list inside the nav', () => {
    render(<Breadcrumb />);
    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('renders the correct links for a three-level path', () => {
    mockState.pathname = '/communities/comm-1/treasury';
    render(<Breadcrumb />);

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Communities' })).toHaveAttribute(
      'href',
      '/communities'
    );
    expect(screen.getByRole('link', { name: 'comm-1' })).toHaveAttribute(
      'href',
      '/communities/comm-1'
    );
  });

  it('renders the current page as text, not a link', () => {
    mockState.pathname = '/communities/comm-1/treasury';
    render(<Breadcrumb />);

    expect(screen.queryByRole('link', { name: 'Treasury' })).not.toBeInTheDocument();
    expect(screen.getByText('Treasury')).not.toHaveAttribute('href');
  });

  it('marks the last item with aria-current="page"', () => {
    mockState.pathname = '/communities/comm-1/treasury';
    render(<Breadcrumb />);

    expect(screen.getByText('Treasury')).toHaveAttribute('aria-current', 'page');
  });

  // -------------------------------------------------------------------------
  // Suppression on top-level routes
  // -------------------------------------------------------------------------
  it('renders nothing on the landing page (/)', () => {
    mockState.pathname = '/';
    const { container } = render(<Breadcrumb />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on /dashboard', () => {
    mockState.pathname = '/dashboard';
    const { container } = render(<Breadcrumb />);
    expect(container).toBeEmptyDOMElement();
  });

  // -------------------------------------------------------------------------
  // Manual crumbs prop
  // -------------------------------------------------------------------------
  it('uses the crumbs prop instead of deriving from the pathname', () => {
    mockState.pathname = '/dashboard'; // would be suppressed without crumbs prop

    const crumbs: BreadcrumbItem[] = [
      { label: 'Home', href: '/' },
      { label: 'Solar Co-op 1', href: '/communities/comm-1' },
      { label: 'Treasury' },
    ];

    render(<Breadcrumb crumbs={crumbs} />);

    expect(screen.getByRole('link', { name: 'Solar Co-op 1' })).toHaveAttribute(
      'href',
      '/communities/comm-1'
    );
    expect(screen.getByText('Treasury')).toHaveAttribute('aria-current', 'page');
  });

  it('renders resolved community names via the crumbs prop', () => {
    const crumbs: BreadcrumbItem[] = [
      { label: 'Home', href: '/' },
      { label: 'Communities', href: '/communities' },
      { label: 'Solar Co-op 1', href: '/communities/comm-1' },
      { label: 'Membership' },
    ];

    render(<Breadcrumb crumbs={crumbs} />);

    expect(screen.getByRole('link', { name: 'Solar Co-op 1' })).toBeInTheDocument();
    expect(screen.getByText('Membership')).toHaveAttribute('aria-current', 'page');
  });

  it('renders nothing when only one crumb is supplied', () => {
    const { container } = render(<Breadcrumb crumbs={[{ label: 'Home', href: '/' }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  // -------------------------------------------------------------------------
  // Accessibility — separators
  // -------------------------------------------------------------------------
  it('hides separators from assistive technology via aria-hidden', () => {
    mockState.pathname = '/communities/comm-1/treasury';
    render(<Breadcrumb />);

    const separators = document.querySelectorAll('[aria-hidden="true"]');
    // There should be one separator per intermediate crumb (Home, Communities, comm-1 → 3 separators).
    expect(separators.length).toBeGreaterThanOrEqual(3);
  });

  // -------------------------------------------------------------------------
  // Pathname variants
  // -------------------------------------------------------------------------
  it('renders correctly on /communities', () => {
    mockState.pathname = '/communities';
    render(<Breadcrumb />);

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText('Communities')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Communities' })).not.toBeInTheDocument();
  });

  it('renders correctly on /communities/[id]/edit', () => {
    mockState.pathname = '/communities/comm-42/edit';
    render(<Breadcrumb />);

    expect(screen.getByRole('link', { name: 'Communities' })).toHaveAttribute(
      'href',
      '/communities'
    );
    expect(screen.getByRole('link', { name: 'comm-42' })).toHaveAttribute(
      'href',
      '/communities/comm-42'
    );
    expect(screen.getByText('Edit')).toHaveAttribute('aria-current', 'page');
  });

  it('renders correctly on /profile', () => {
    mockState.pathname = '/profile';
    render(<Breadcrumb />);

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByText('Profile')).toHaveAttribute('aria-current', 'page');
  });
});
