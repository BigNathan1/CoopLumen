import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from '@/components/ui/Checkbox';

describe('Checkbox', () => {
  it('associates the label with the checkbox control', async () => {
    render(<Checkbox label="I agree to the terms" />);

    const checkbox = screen.getByLabelText('I agree to the terms');
    expect(checkbox).toBeInstanceOf(HTMLInputElement);
    expect(checkbox).toHaveAttribute('type', 'checkbox');

    await userEvent.click(screen.getByText('I agree to the terms'));
    expect(checkbox).toBeChecked();
  });

  it('generates a unique id per instance when none is given', () => {
    render(
      <>
        <Checkbox label="First" />
        <Checkbox label="Second" />
      </>
    );

    const first = screen.getByLabelText('First');
    const second = screen.getByLabelText('Second');
    expect(first.id).toBeTruthy();
    expect(first.id).not.toBe(second.id);
  });

  it('honours a caller-supplied id', () => {
    render(<Checkbox label="Remember me" id="remember" />);
    expect(screen.getByLabelText('Remember me')).toHaveAttribute('id', 'remember');
  });

  it('toggles checked state on click', async () => {
    const onChange = jest.fn();
    render(<Checkbox label="Accept" onChange={onChange} />);

    const checkbox = screen.getByLabelText('Accept');
    expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(1);

    await userEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('is reachable by keyboard and toggles on Space', async () => {
    const onChange = jest.fn();
    render(<Checkbox label="Accept" onChange={onChange} />);

    await userEvent.tab();
    expect(screen.getByLabelText('Accept')).toHaveFocus();

    await userEvent.keyboard(' ');
    expect(screen.getByLabelText('Accept')).toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not toggle while disabled', async () => {
    const onChange = jest.fn();
    render(<Checkbox label="Locked" disabled onChange={onChange} />);

    const checkbox = screen.getByLabelText('Locked');
    expect(checkbox).toBeDisabled();

    await userEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('can be controlled with checked and onChange', async () => {
    const { rerender } = render(<Checkbox label="Notify" checked onChange={() => {}} />);
    expect(screen.getByLabelText('Notify')).toBeChecked();

    rerender(<Checkbox label="Notify" checked={false} onChange={() => {}} />);
    expect(screen.getByLabelText('Notify')).not.toBeChecked();
  });

  it('supports defaultChecked for uncontrolled use', () => {
    render(<Checkbox label="Pre-checked" defaultChecked />);
    expect(screen.getByLabelText('Pre-checked')).toBeChecked();
  });

  it('describes the control with its helper text', () => {
    render(<Checkbox label="Subscribe" helperText="We will never spam you" />);

    expect(screen.getByLabelText('Subscribe')).toHaveAccessibleDescription(
      'We will never spam you'
    );
  });

  it('is not marked invalid without an error', () => {
    render(<Checkbox label="Accept" helperText="Read the terms first" />);

    const checkbox = screen.getByLabelText('Accept');
    expect(checkbox).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('announces the error and marks the control invalid', () => {
    render(<Checkbox label="Accept" error="You must accept the terms" />);

    const checkbox = screen.getByLabelText('Accept');
    expect(checkbox).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('You must accept the terms');
    expect(checkbox).toHaveAccessibleDescription('You must accept the terms');
  });

  it('describes the control with both the helper text and the error', () => {
    render(<Checkbox label="Accept" helperText="Read first" error="Required" />);

    expect(screen.getByLabelText('Accept')).toHaveAccessibleDescription('Read first Required');
  });

  it('marks the control invalid without a message when error is true', () => {
    render(<Checkbox label="Accept" error />);

    expect(screen.getByLabelText('Accept')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('treats an empty error string as no error', () => {
    render(<Checkbox label="Accept" error="" />);

    expect(screen.getByLabelText('Accept')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sets both required and aria-required when required', () => {
    render(<Checkbox label="Terms" required />);

    const checkbox = screen.getByLabelText(/Terms/);
    expect(checkbox).toBeRequired();
    expect(checkbox).toHaveAttribute('aria-required', 'true');
  });

  it('keeps a caller-supplied aria-describedby alongside its own', () => {
    render(
      <>
        <p id="external">External hint</p>
        <Checkbox label="Accept" helperText="Read first" aria-describedby="external" />
      </>
    );

    expect(screen.getByLabelText('Accept')).toHaveAccessibleDescription(
      'External hint Read first'
    );
  });

  it('keeps the label available to assistive technology when hidden visually', () => {
    render(<Checkbox label="Quick toggle" hideLabel />);
    expect(screen.getByLabelText('Quick toggle')).toBeInTheDocument();
  });

  it('hides the required indicator from assistive technology', () => {
    render(<Checkbox label="Required field" required />);

    // The "(required)" text should be srOnly, not announced as visible text
    const checkbox = screen.getByLabelText(/Required field/);
    expect(checkbox).toBeRequired();
  });

  it('keeps the caller-supplied className alongside its own', () => {
    render(<Checkbox label="Custom" className="my-class" />);
    expect(screen.getByLabelText('Custom')).toHaveClass('my-class');
  });

  it('applies containerClassName to the wrapper', () => {
    render(<Checkbox label="Styled" containerClassName="wrapper-class" />);
    expect(screen.getByLabelText('Styled').closest('.wrapper-class')).not.toBeNull();
  });

  it('forwards a ref to the underlying input element', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Checkbox label="Ref" ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current?.type).toBe('checkbox');
  });

  it('passes through arbitrary input attributes', () => {
    render(<Checkbox label="Data" data-testid="custom-check" name="同意" value="yes" />);

    const checkbox = screen.getByTestId('custom-check');
    expect(checkbox).toHaveAttribute('name', '同意');
    expect(checkbox).toHaveAttribute('value', 'yes');
  });

  it('renders helper text below the checkbox', () => {
    render(<Checkbox label="Subscribe" helperText="Monthly newsletter" />);
    expect(screen.getByText('Monthly newsletter')).toBeInTheDocument();
  });

  it('renders error message below the checkbox', () => {
    render(<Checkbox label="Accept" error="Required field" />);
    expect(screen.getByText('Required field')).toBeInTheDocument();
  });

  it('does not render helper or error when neither is provided', () => {
    render(<Checkbox label="Simple" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders both helper and error simultaneously', () => {
    render(<Checkbox label="Both" helperText="Hint" error="Error" />);
    expect(screen.getByText('Hint')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Error');
  });
});
