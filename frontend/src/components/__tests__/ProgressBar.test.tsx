import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import {
  ProgressBar,
  type ProgressBarSize,
  type ProgressBarVariant,
} from '@/components/ui/ProgressBar';

describe('ProgressBar', () => {
  it('renders a progressbar element with appropriate aria attributes', () => {
    render(<ProgressBar value={45} max={100} label="Loan Repayment" />);
    const bar = screen.getByRole('progressbar', { name: 'Loan Repayment' });

    expect(bar).toBeInTheDocument();
    expect(bar).toHaveAttribute('aria-valuenow', '45');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuetext', '45%');
  });

  it('clamps values below min and above max', () => {
    const { rerender } = render(<ProgressBar value={-20} min={0} max={100} label="Progress" />);
    let bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(bar).toHaveAttribute('aria-valuetext', '0%');

    rerender(<ProgressBar value={150} min={0} max={100} label="Progress" />);
    bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuetext', '100%');
  });

  it('defaults to primary variant and md size', () => {
    render(<ProgressBar value={50} label="Progress" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('data-variant', 'primary');
    expect(bar).toHaveAttribute('data-size', 'md');
  });

  it.each<ProgressBarVariant>(['primary', 'secondary', 'success', 'warning', 'danger', 'info'])(
    'renders the %s variant',
    (variant) => {
      render(<ProgressBar variant={variant} value={30} label="Status" />);
      expect(screen.getByRole('progressbar')).toHaveAttribute('data-variant', variant);
    }
  );

  it.each<ProgressBarSize>(['sm', 'md', 'lg'])('renders the %s size', (size) => {
    render(<ProgressBar size={size} value={30} label="Size Check" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-size', size);
  });

  it('hides label visually when hideLabel is true but preserves accessible name', () => {
    render(<ProgressBar value={60} label="Governance Quorum" hideLabel />);
    const bar = screen.getByRole('progressbar', { name: 'Governance Quorum' });
    expect(bar).toBeInTheDocument();
  });

  it('renders visible formatted value when showValue is true', () => {
    render(<ProgressBar value={75} max={100} label="Repaid" showValue />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('supports custom valueFormatter for both visible text and aria-valuetext', () => {
    render(
      <ProgressBar
        value={2500}
        max={10000}
        label="Quorum Progress"
        showValue
        valueFormatter={(val, max) => `${val} / ${max} XLM`}
      />
    );
    expect(screen.getByText('2500 / 10000 XLM')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuetext', '2500 / 10000 XLM');
  });

  it('renders helper text and associates it via aria-describedby', () => {
    render(
      <ProgressBar
        value={30}
        label="Loan Term"
        helperText="Next payment of 150 XLM due in 5 days"
      />
    );
    const bar = screen.getByRole('progressbar');
    expect(screen.getByText('Next payment of 150 XLM due in 5 days')).toBeInTheDocument();
    const describedBy = bar.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      'Next payment of 150 XLM due in 5 days'
    );
  });

  it('renders a threshold marker for quorum indicators', () => {
    const { container } = render(
      <ProgressBar
        value={40}
        max={100}
        threshold={60}
        thresholdLabel="60% Quorum required"
        label="Proposal Votes"
      />
    );
    const marker = container.querySelector('div[title="60% Quorum required"]');
    expect(marker).toBeInTheDocument();
    expect(marker).toHaveStyle({ left: '60%' });
    expect(marker).toHaveAttribute('aria-hidden', 'true');
  });

  it('handles indeterminate mode correctly without aria-valuenow', () => {
    render(<ProgressBar indeterminate label="Calculating repayment schedule..." showValue />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('data-indeterminate', 'true');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar).not.toHaveAttribute('aria-valuetext');
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('forwards ref to the underlying progressbar element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<ProgressBar ref={ref} value={50} label="Ref test" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current).toHaveAttribute('role', 'progressbar');
  });

  it('supports custom aria-label when label prop is omitted', () => {
    render(<ProgressBar aria-label="Direct ARIA Label" value={80} />);
    expect(screen.getByRole('progressbar', { name: 'Direct ARIA Label' })).toBeInTheDocument();
  });

  it('applies custom className and containerClassName', () => {
    const { container } = render(
      <ProgressBar
        value={20}
        label="Custom Classes"
        className="track-custom"
        containerClassName="wrapper-custom"
      />
    );
    expect(container.firstChild).toHaveClass('wrapper-custom');
    expect(screen.getByRole('progressbar')).toHaveClass('track-custom');
  });
});
