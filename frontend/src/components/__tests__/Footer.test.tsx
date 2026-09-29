import { render, screen } from '@testing-library/react';
import { Footer } from '../Footer';

const mockState = { pathname: '/dashboard' };

jest.mock('next/navigation', () => ({
  usePathname: () => mockState.pathname,
}));

beforeEach(() => {
  mockState.pathname = '/dashboard';
});

describe('Footer', () => {
  it('renders links to docs, GitHub, and community channels', () => {
    render(<Footer />);

    const nav = screen.getByRole('navigation', { name: 'Footer' });
    expect(nav).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Documentation' })).toHaveAttribute(
      'href',
      'https://github.com/BigNathan1/CoopLumen#readme'
    );
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/BigNathan1/CoopLumen'
    );
    expect(screen.getByRole('link', { name: 'Community' })).toHaveAttribute(
      'href',
      'https://github.com/BigNathan1/CoopLumen/discussions'
    );
  });

  it('shows the current year in the copyright line', () => {
    render(<Footer />);
    expect(screen.getByText(`© ${new Date().getFullYear()} CoopLumen`)).toBeInTheDocument();
  });

  it('does not render on the landing page', () => {
    mockState.pathname = '/';
    const { container } = render(<Footer />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders on non-landing routes', () => {
    mockState.pathname = '/communities';
    render(<Footer />);
    expect(screen.getByRole('navigation', { name: 'Footer' })).toBeInTheDocument();
  });
});
