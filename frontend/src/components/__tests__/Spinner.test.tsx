import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { Spinner, type SpinnerSize } from '@/components/ui/Spinner';

function getSpinner() {
  return document.querySelector('[data-size]')!;
}

describe('Spinner', () => {
  describe('rendering', () => {
    it('renders a span element', () => {
      render(<Spinner />);
      expect(getSpinner().tagName).toBe('SPAN');
    });

    it('defaults to the md size', () => {
      render(<Spinner />);
      expect(getSpinner()).toHaveAttribute('data-size', 'md');
    });

    it.each<SpinnerSize>(['sm', 'md', 'lg'])('renders the %s size', (size) => {
      render(<Spinner size={size} />);
      expect(getSpinner()).toHaveAttribute('data-size', size);
    });
  });

  describe('accessibility', () => {
    it('is decorative (aria-hidden) when no label is provided', () => {
      render(<Spinner />);
      expect(getSpinner()).toHaveAttribute('aria-hidden', 'true');
    });

    it('has role="status" and aria-live="polite" when a label is provided', () => {
      render(<Spinner label="Loading" />);
      expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    });

    it('announces the label to assistive technology', () => {
      render(<Spinner label="Loading balances" />);
      expect(screen.getByText('Loading balances')).toBeInTheDocument();
    });

    it('hides the label visually via an srOnly span', () => {
      render(<Spinner label="Loading" />);
      const srOnly = screen.getByText('Loading');
      // srOnly is a CSS module class; verify it's a child of the status span
      expect(srOnly.parentElement).toHaveAttribute('role', 'status');
    });

    it('does not have role="status" when decorative', () => {
      render(<Spinner />);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('color', () => {
    it('does not set an inline color by default', () => {
      render(<Spinner />);
      const spinner = getSpinner();
      expect(spinner.getAttribute('style')).toBeFalsy();
    });

    it('applies an explicit color', () => {
      render(<Spinner color="#ff0000" />);
      expect(getSpinner()).toHaveStyle({ color: '#ff0000' });
    });
  });

  describe('className passthrough', () => {
    it('applies a custom className alongside its own', () => {
      render(<Spinner className="my-spinner" />);
      expect(getSpinner()).toHaveClass('my-spinner');
    });
  });

  describe('forwarded props', () => {
    it('forwards data-testid to the element', () => {
      render(<Spinner data-testid="loading" />);
      expect(screen.getByTestId('loading')).toBeInTheDocument();
    });

    it('forwards a ref to the underlying span', () => {
      const ref = createRef<HTMLSpanElement>();
      render(<Spinner ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    });

    it('passes through arbitrary span attributes', () => {
      render(<Spinner id="spinner-1" />);
      expect(document.querySelector('#spinner-1')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('renders with both label and className', () => {
      render(<Spinner label="Loading" className="custom" />);
      const spinner = screen.getByRole('status');
      expect(spinner).toHaveClass('custom');
      expect(spinner).toHaveAttribute('aria-live', 'polite');
    });

    it('does not render a child label element when decorative', () => {
      const { container } = render(<Spinner />);
      expect(container.querySelector('[role="status"]')).not.toBeInTheDocument();
    });

    it('renders a child label element when label is provided', () => {
      render(<Spinner label="Please wait" />);
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('Please wait');
    });
  });
});
