import { render, screen } from '@testing-library/react';
import { Sidebar } from '../Sidebar';

const mockState = { pathname: '/communities/comm-1' };

jest.mock('next/navigation', () => ({
  usePathname: () => mockState.pathname,
}));

describe('Sidebar', () => {
  afterEach(() => {
    mockState.pathname = '/communities/comm-1';
  });

  it('renders the default community sections as links scoped to the community', () => {
    render(<Sidebar communityId="comm-1" />);

    expect(screen.getByRole('navigation', { name: 'Community' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/communities/comm-1'
    );
    expect(screen.getByRole('link', { name: 'Treasury' })).toHaveAttribute(
      'href',
      '/communities/comm-1/treasury'
    );
    expect(screen.getByRole('link', { name: 'Membership' })).toHaveAttribute(
      'href',
      '/communities/comm-1/membership'
    );
  });

  it('marks the section matching the current route as current', () => {
    mockState.pathname = '/communities/comm-1/treasury';
    render(<Sidebar communityId="comm-1" />);

    expect(screen.getByRole('link', { name: 'Treasury' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('marks the overview link current on the community root route', () => {
    mockState.pathname = '/communities/comm-1';
    render(<Sidebar communityId="comm-1" />);

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  });

  it('scopes links to the given community id', () => {
    render(<Sidebar communityId="another-community" />);

    expect(screen.getByRole('link', { name: 'Tokens' })).toHaveAttribute(
      'href',
      '/communities/another-community/tokens'
    );
  });

  it('accepts a custom set of sections', () => {
    render(
      <Sidebar communityId="comm-1" sections={[{ segment: 'custom', label: 'Custom Section' }]} />
    );

    expect(screen.getByRole('link', { name: 'Custom Section' })).toHaveAttribute(
      'href',
      '/communities/comm-1/custom'
    );
    expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument();
  });
});
