import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '@/components/ui/Input';

describe('Input', () => {
  it('associates the label with the control', async () => {
    render(<Input label="Community name" />);

    const input = screen.getByLabelText('Community name');
    expect(input).toBeInstanceOf(HTMLInputElement);

    await userEvent.click(screen.getByText('Community name'));
    expect(input).toHaveFocus();
  });

  it('generates a unique id per instance when none is given', () => {
    render(
      <>
        <Input label="First" />
        <Input label="Second" />
      </>
    );

    const first = screen.getByLabelText('First');
    const second = screen.getByLabelText('Second');
    expect(first.id).toBeTruthy();
    expect(first.id).not.toBe(second.id);
  });

  it('honours a caller-supplied id', () => {
    render(<Input label="Asset code" id="asset-code" />);
    expect(screen.getByLabelText('Asset code')).toHaveAttribute('id', 'asset-code');
  });

  it('defaults to a text input and accepts another type', () => {
    const { rerender } = render(<Input label="Search" />);
    expect(screen.getByLabelText('Search')).toHaveAttribute('type', 'text');

    rerender(<Input label="Search" type="email" />);
    expect(screen.getByLabelText('Search')).toHaveAttribute('type', 'email');
  });

  it('keeps the label available to assistive technology when hidden visually', () => {
    render(<Input label="Search communities" hideLabel />);
    expect(screen.getByLabelText('Search communities')).toBeInTheDocument();
  });

  it('describes the control with its helper text', () => {
    render(<Input label="Asset code" helperText="1-12 characters" />);

    expect(screen.getByLabelText('Asset code')).toHaveAccessibleDescription('1-12 characters');
  });

  it('is not marked invalid without an error', () => {
    render(<Input label="Asset code" helperText="1-12 characters" />);

    const input = screen.getByLabelText('Asset code');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('announces the error and marks the control invalid', () => {
    render(<Input label="Asset code" error="Asset code is required" />);

    const input = screen.getByLabelText('Asset code');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Asset code is required');
    expect(input).toHaveAccessibleDescription('Asset code is required');
  });

  it('describes the control with both the helper text and the error', () => {
    render(<Input label="Asset code" helperText="1-12 characters" error="Too long" />);

    expect(screen.getByLabelText('Asset code')).toHaveAccessibleDescription(
      '1-12 characters Too long'
    );
  });

  it('marks the control invalid without a message when error is true', () => {
    render(<Input label="Asset code" error />);

    expect(screen.getByLabelText('Asset code')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('treats an empty error string as no error', () => {
    render(<Input label="Asset code" error="" />);

    expect(screen.getByLabelText('Asset code')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sets both required and aria-required when required', () => {
    render(<Input label="Community name" required />);

    const input = screen.getByLabelText(/Community name/);
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-required', 'true');
  });

  it('keeps a caller-supplied aria-describedby alongside its own', () => {
    render(
      <>
        <p id="external">Shown elsewhere</p>
        <Input label="Memo" helperText="Optional" aria-describedby="external" />
      </>
    );

    expect(screen.getByLabelText('Memo')).toHaveAccessibleDescription('Shown elsewhere Optional');
  });

  it('accepts typed input and reports changes', async () => {
    const onChange = jest.fn();
    render(<Input label="Community name" onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Community name'), 'EcoDAO');

    expect(screen.getByLabelText('Community name')).toHaveValue('EcoDAO');
    expect(onChange).toHaveBeenCalled();
  });

  it('does not accept input while disabled', async () => {
    render(<Input label="Community name" disabled />);

    const input = screen.getByLabelText('Community name');
    expect(input).toBeDisabled();

    await userEvent.type(input, 'EcoDAO');
    expect(input).toHaveValue('');
  });

  it('hides decorative icons from assistive technology', () => {
    render(
      <Input
        label="Amount"
        leadingIcon={<svg data-testid="leading" />}
        trailingIcon={<svg data-testid="trailing" />}
      />
    );

    expect(screen.getByTestId('leading').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('trailing').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByLabelText('Amount')).toHaveAccessibleName('Amount');
  });

  it('applies className to the control and containerClassName to the wrapper', () => {
    render(<Input label="Memo" className="wide" containerClassName="span-two" />);

    const input = screen.getByLabelText('Memo');
    expect(input).toHaveClass('wide');
    expect(input.closest('.span-two')).not.toBeNull();
  });

  it('forwards a ref to the underlying input element', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input label="Memo" ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('passes through arbitrary input attributes', () => {
    render(<Input label="Memo" placeholder="Up to 28 characters" maxLength={28} />);

    const input = screen.getByPlaceholderText('Up to 28 characters');
    expect(input).toHaveAttribute('maxlength', '28');
  });
});
