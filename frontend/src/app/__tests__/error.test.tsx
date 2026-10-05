import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorPage from '@/app/error';

describe('App Router error page', () => {
  const error = new Error('Private failure details');

  it('announces a safe message without exposing error details', () => {
    render(<ErrorPage error={error} reset={jest.fn()} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Something went wrong');
    expect(alert).toHaveTextContent('We encountered an unexpected error. Please try again.');
    expect(alert).not.toHaveTextContent('Private failure details');
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveAttribute('type', 'button');
  });

  it('allows keyboard users to retry through the Next.js reset callback', async () => {
    const user = userEvent.setup();
    const reset = jest.fn();
    render(<ErrorPage error={error} reset={reset} />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
