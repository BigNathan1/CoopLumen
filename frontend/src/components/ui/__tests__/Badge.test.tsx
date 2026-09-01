import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { Badge, type BadgeSize, type BadgeVariant } from '@/components/ui/Badge';

describe('Badge', () => {
  it('renders its children as text content', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('defaults to the neutral variant at the medium size', () => {
    render(<Badge>Label</Badge>);
    const badge = screen.getByText('Label');
    expect(badge).toHaveAttribute('data-variant', 'neutral');
    expect(badge).toHaveAttribute('data-size', 'md');
  });

  it.each<BadgeVariant>(['success', 'warning', 'error', 'info', 'neutral'])(
    'renders the %s variant',
    (variant) => {
      render(<Badge variant={variant}>Status</Badge>);
      expect(screen.getByText('Status')).toHaveAttribute('data-variant', variant);
    }
  );

  it.each<BadgeSize>(['sm', 'md', 'lg'])('renders the %s size', (size) => {
    render(<Badge size={size}>Label</Badge>);
    expect(screen.getByText('Label')).toHaveAttribute('data-size', size);
  });

  it('shows a dot indicator when dot is true', () => {
    const { container } = render(<Badge dot>Live</Badge>);
    const badge = screen.getByText('Live');
    const hiddenSpans = badge.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenSpans.length).toBe(1);
  });

  it('hides the dot from assistive technology', () => {
    render(<Badge dot>Live</Badge>);
    const badge = screen.getByText('Live');
    const dot = badge.querySelector('[aria-hidden="true"]');
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders an icon before the label when provided', () => {
    render(<Badge icon={<svg data-testid="icon" />}>Info</Badge>);
    const icon = screen.getByTestId('icon');
    expect(icon).toBeInTheDocument();
    expect(icon.parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Info')).toBeInTheDocument();
  });

  it('does not render the icon when dot is also true', () => {
    render(
      <Badge dot icon={<svg data-testid="icon" />}>
        Live
      </Badge>
    );
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
  });

  it('applies srLabel as the accessible text', () => {
    render(<Badge srLabel="Status: active">Active</Badge>);
    const srText = screen.getByText('Status: active');
    expect(srText).toBeInTheDocument();
    expect(srText.parentElement).toBe(screen.getByText('Active'));
  });

  it('keeps the caller-supplied className alongside its own', () => {
    render(<Badge className="custom-badge">Label</Badge>);
    const badge = screen.getByText('Label');
    expect(badge).toHaveClass('custom-badge');
  });

  it('forwards a ref to the underlying span element', () => {
    const ref = createRef<HTMLSpanElement>();
    render(<Badge ref={ref}>Label</Badge>);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });

  it('passes through arbitrary span attributes', () => {
    render(
      <Badge data-testid="badge" aria-label="Custom label">
        3
      </Badge>
    );
    expect(screen.getByTestId('badge')).toHaveAccessibleName('Custom label');
  });

  it('renders as a span element', () => {
    render(<Badge>Text</Badge>);
    expect(screen.getByText('Text').tagName).toBe('SPAN');
  });

  it('does not render hidden spans when no dot or icon', () => {
    render(<Badge>Plain</Badge>);
    const badge = screen.getByText('Plain');
    const hiddenElements = badge.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenElements.length).toBe(0);
  });

  it('renders dot with higher precedence than icon', () => {
    render(
      <Badge dot icon={<svg data-testid="icon" />}>
        Live
      </Badge>
    );
    // dot=true should suppress the icon
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
    // and the dot aria-hidden span should still be present
    const badge = screen.getByText('Live');
    const hiddenSpans = badge.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenSpans.length).toBe(1);
  });
});
