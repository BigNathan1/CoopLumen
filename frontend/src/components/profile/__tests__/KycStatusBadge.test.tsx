import { render, screen } from '@testing-library/react';
import { KycStatusBadge } from '@/components/profile/KycStatusBadge';

describe('KycStatusBadge', () => {
  it.each([
    ['approved', 'KYC verified', 'success'],
    ['pending', 'KYC pending', 'warning'],
    ['rejected', 'KYC rejected', 'error'],
    ['none', 'KYC not started', 'neutral'],
  ] as const)('renders %s as "%s"', (status, label, variant) => {
    render(<KycStatusBadge status={status} />);

    expect(screen.getByText(label)).toHaveAttribute('data-variant', variant);
  });

  it('announces the badge as a KYC status for screen readers', () => {
    render(<KycStatusBadge status="approved" />);

    expect(screen.getByText('KYC status:')).toBeInTheDocument();
  });
});
