import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/Button';

describe('Button', () => {
  it('renders its children as the accessible name', () => {
    render(<Button>Create community</Button>);
    expect(screen.getByRole('button', { name: 'Create community' })).toBeInTheDocument();
  });

  it('defaults to the primary variant at the medium size', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('data-variant', 'primary');
    expect(button).toHaveAttribute('data-size', 'md');
  });

  it.each<ButtonVariant>(['primary', 'secondary', 'ghost', 'danger'])(
    'renders the %s variant',
    (variant) => {
      render(<Button variant={variant}>Act</Button>);
      expect(screen.getByRole('button', { name: 'Act' })).toHaveAttribute('data-variant', variant);
    }
  );

  it.each<ButtonSize>(['sm', 'md', 'lg'])('renders the %s size', (size) => {
    render(<Button size={size}>Act</Button>);
    expect(screen.getByRole('button', { name: 'Act' })).toHaveAttribute('data-size', size);
  });

  it('defaults type to button so it cannot submit a surrounding form by accident', () => {
    render(<Button>Cancel</Button>);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('type', 'button');
  });

  it('honours an explicit type', () => {
    render(<Button type="submit">Send</Button>);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'submit');
  });

  it('calls onClick when activated with the mouse', async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Join</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Join' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is reachable by keyboard and activates on Enter and Space', async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Join</Button>);

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Join' })).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('does not fire onClick while disabled', async () => {
    const onClick = jest.fn();
    render(
      <Button disabled onClick={onClick}>
        Join
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Join' });
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disables itself, reports aria-busy and announces the wait while loading', () => {
    render(<Button isLoading>Submit</Button>);

    const button = screen.getByRole('button', { name: /Submit/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('uses a custom loading label', () => {
    render(
      <Button isLoading loadingLabel="Issuing tokens">
        Issue
      </Button>
    );
    expect(screen.getByRole('status')).toHaveTextContent('Issuing tokens');
  });

  it('omits aria-busy and the announcement when idle', () => {
    render(<Button>Submit</Button>);
    const button = screen.getByRole('button', { name: 'Submit' });
    expect(button).not.toHaveAttribute('aria-busy');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('hides decorative icons from assistive technology', () => {
    render(
      <Button leftIcon={<svg data-testid="left" />} rightIcon={<svg data-testid="right" />}>
        Export
      </Button>
    );

    expect(screen.getByTestId('left').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('right').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('replaces the leading icon with the spinner while loading', () => {
    render(
      <Button
        isLoading
        leftIcon={<svg data-testid="left" />}
        rightIcon={<svg data-testid="right" />}
      >
        Export
      </Button>
    );

    expect(screen.queryByTestId('left')).not.toBeInTheDocument();
    expect(screen.queryByTestId('right')).not.toBeInTheDocument();
  });

  it('keeps the caller-supplied className alongside its own', () => {
    render(<Button className="dashboard-action">Act</Button>);
    expect(screen.getByRole('button', { name: 'Act' })).toHaveClass('dashboard-action');
  });

  it('forwards a ref to the underlying button element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Act</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('passes through arbitrary button attributes', () => {
    render(<Button aria-label="Close dialog" data-testid="close" />);
    expect(screen.getByTestId('close')).toHaveAccessibleName('Close dialog');
  });
});
