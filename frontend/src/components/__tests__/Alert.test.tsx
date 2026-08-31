import { render, screen } from '@testing-library/react';
import { Alert } from '@/components/ui/Alert';

describe('Alert', () => {
  it('renders an informational alert as a status message', () => {
    render(
      <Alert variant="info" title="Information">
        Your community is ready.
      </Alert>
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Information')).toBeInTheDocument();
    expect(screen.getByText('Your community is ready.')).toBeInTheDocument();
  });

  it('uses alert semantics for errors', () => {
    render(<Alert variant="error">Unable to load communities.</Alert>);

    // `alert` does not take its accessible name from content, so assert the
    // role and its text separately.
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load communities.');
  });

  it.each(['success', 'warning', 'info', 'error'] as const)('renders the %s variant', (variant) => {
    render(<Alert variant={variant}>Feedback message</Alert>);

    const element = variant === 'error' ? screen.getByRole('alert') : screen.getByRole('status');

    expect(element).toHaveClass(`alert-${variant}`);
  });
});
