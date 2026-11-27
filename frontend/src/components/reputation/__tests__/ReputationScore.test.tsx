import { render, screen } from '@testing-library/react';
import { ReputationScore } from '../ReputationScore';

describe('ReputationScore', () => {
  it('renders an accessible meter with clamped 0–100 values', () => {
    render(<ReputationScore score={86} />);
    const meter = screen.getByRole('meter', { name: /reputation score/i });
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
    expect(meter).toHaveAttribute('aria-valuenow', '86');
    expect(screen.getByText(/excellent/i)).toBeInTheDocument();
  });

  it('clamps out-of-range scores to 0 and 100', () => {
    const { rerender } = render(<ReputationScore score={140} />);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '100');

    rerender(<ReputationScore score={-10} />);
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
  });

  it('handles missing score without coercing to zero', () => {
    render(<ReputationScore score={null} />);
    expect(screen.getByText(/not yet rated/i)).toBeInTheDocument();
    expect(screen.getByRole('meter')).not.toHaveAttribute('aria-valuenow');
  });
});
