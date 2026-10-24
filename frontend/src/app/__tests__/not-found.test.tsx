import { render, screen } from '@testing-library/react';
import NotFound, { metadata } from '../not-found';

describe('NotFound', () => {
  it('exports page metadata with a descriptive title and description', () => {
    expect(metadata).toEqual({
      title: 'Page not found | CoopLumen',
      description: 'The page you were looking for could not be found.',
    });
  });

  it('renders a heading announcing the page was not found', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading', { name: 'Page not found', level: 1 })).toBeInTheDocument();
  });

  it('renders the explanatory message and hides the decorative 404 code from screen readers', () => {
    render(<NotFound />);
    expect(
      screen.getByText("The page you were looking for doesn't exist, or may have moved.")
    ).toBeInTheDocument();
    expect(screen.getByText('404')).toHaveAttribute('aria-hidden', 'true');
  });

  it('links back to the dashboard and the homepage', () => {
    render(<NotFound />);
    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard'
    );
    expect(screen.getByRole('link', { name: 'Back to homepage' })).toHaveAttribute('href', '/');
  });
});
