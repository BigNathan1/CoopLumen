import { render, screen } from '@testing-library/react';
import { LoadingSkeleton } from '../LoadingSkeleton';

/** The placeholder bars, which are hidden from assistive technology. */
function bars(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-skeleton-variant]'));
}

describe('LoadingSkeleton', () => {
  it('renders a single text placeholder by default', () => {
    const { container } = render(<LoadingSkeleton />);

    expect(bars(container)).toHaveLength(1);
    expect(bars(container)[0]).toHaveAttribute('data-skeleton-variant', 'text');
  });

  it('exposes a polite status region carrying a default announcement', () => {
    render(<LoadingSkeleton />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-busy', 'true');
    // Live regions are announced from their text content, which is visually hidden.
    expect(status).toHaveTextContent('Loading');
  });

  it('announces a caller-supplied label', () => {
    render(<LoadingSkeleton label="Loading communities" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading communities');
  });

  it('hides the placeholder bars from assistive technology', () => {
    const { container } = render(<LoadingSkeleton count={3} />);
    bars(container).forEach((bar) => expect(bar).toHaveAttribute('aria-hidden', 'true'));
  });

  it('renders one bar per count', () => {
    const { container } = render(<LoadingSkeleton count={4} />);
    expect(bars(container)).toHaveLength(4);
  });

  it('clamps a zero or negative count to a single bar', () => {
    const { container } = render(<LoadingSkeleton count={0} />);
    expect(bars(container)).toHaveLength(1);
  });

  it('floors a fractional count instead of rendering a partial bar', () => {
    const { container } = render(<LoadingSkeleton count={3.7} />);
    expect(bars(container)).toHaveLength(3);
  });

  describe('when decorative', () => {
    it('is removed from the accessibility tree', () => {
      render(<LoadingSkeleton decorative />);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('renders no duplicate loading announcement', () => {
      render(<LoadingSkeleton decorative label="Loading communities" />);
      expect(screen.queryByText('Loading communities')).not.toBeInTheDocument();
    });

    it('still renders the placeholder bars', () => {
      const { container } = render(<LoadingSkeleton decorative count={2} />);
      expect(bars(container)).toHaveLength(2);
    });
  });

  describe('sizing', () => {
    it('treats numeric dimensions as pixels', () => {
      const { container } = render(<LoadingSkeleton variant="rect" width={200} height={48} />);
      expect(bars(container)[0]).toHaveStyle({ width: '200px', height: '48px' });
    });

    it('passes string dimensions through as authored CSS', () => {
      const { container } = render(<LoadingSkeleton variant="rect" width="75%" height="2rem" />);
      expect(bars(container)[0]).toHaveStyle({ width: '75%', height: '2rem' });
    });

    it('applies size to both axes for the circle variant', () => {
      const { container } = render(<LoadingSkeleton variant="circle" size={40} />);
      expect(bars(container)[0]).toHaveStyle({ width: '40px', height: '40px' });
      expect(bars(container)[0]).toHaveAttribute('data-skeleton-variant', 'circle');
    });

    it('narrows only the final line of a multi-line text skeleton', () => {
      const { container } = render(<LoadingSkeleton count={3} width="100%" lastLineWidth="60%" />);

      const [first, second, last] = bars(container);
      expect(first).toHaveStyle({ width: '100%' });
      expect(second).toHaveStyle({ width: '100%' });
      expect(last).toHaveStyle({ width: '60%' });
    });

    it('ignores lastLineWidth for a single line', () => {
      const { container } = render(<LoadingSkeleton width="100%" lastLineWidth="60%" />);
      expect(bars(container)[0]).toHaveStyle({ width: '100%' });
    });

    it('ignores lastLineWidth for non-text variants', () => {
      const { container } = render(
        <LoadingSkeleton variant="rect" count={2} width="100%" lastLineWidth="60%" />
      );
      expect(bars(container)[1]).toHaveStyle({ width: '100%' });
    });

    it('applies a radius override', () => {
      const { container } = render(<LoadingSkeleton variant="rect" radius={16} />);
      expect(bars(container)[0]).toHaveStyle({ borderRadius: '16px' });
    });

    it('applies the gap between lines', () => {
      render(<LoadingSkeleton count={2} gap={12} />);
      expect(screen.getByRole('status')).toHaveStyle({ gap: '12px' });
    });
  });

  it('forwards className, style and data-testid to the wrapper', () => {
    render(
      <LoadingSkeleton className="custom" style={{ marginTop: '4px' }} data-testid="skeleton" />
    );

    const status = screen.getByTestId('skeleton');
    expect(status).toHaveClass('custom');
    expect(status).toHaveStyle({ marginTop: '4px' });
  });

  it('does not receive keyboard focus, so tab order is unaffected', () => {
    const { container } = render(<LoadingSkeleton count={2} />);

    expect(screen.getByRole('status')).not.toHaveAttribute('tabindex');
    bars(container).forEach((bar) => expect(bar).not.toHaveAttribute('tabindex'));
    expect(container.querySelector('a, button, input, [tabindex]')).toBeNull();
  });
});
