import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from '@/components/ui/Textarea';

function ControlledTextarea() {
  const [value, setValue] = useState('');
  return (
    <Textarea
      label="Description"
      maxLength={10}
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}

describe('Textarea', () => {
  it('associates the label with the control', async () => {
    render(<Textarea label="Description" />);

    const textarea = screen.getByLabelText('Description');
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);

    await userEvent.click(screen.getByText('Description'));
    expect(textarea).toHaveFocus();
  });

  it('generates a unique id per instance and honours an explicit one', () => {
    const { rerender } = render(
      <>
        <Textarea label="First" />
        <Textarea label="Second" />
      </>
    );

    expect(screen.getByLabelText('First').id).not.toBe(screen.getByLabelText('Second').id);

    rerender(<Textarea label="First" id="notes" />);
    expect(screen.getByLabelText('First')).toHaveAttribute('id', 'notes');
  });

  it('keeps the label available to assistive technology when hidden visually', () => {
    render(<Textarea label="Description" hideLabel />);
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });

  it('shows no counter without maxLength or showCount', () => {
    render(<Textarea label="Description" />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('shows a plain character count when asked', async () => {
    render(<Textarea label="Description" showCount />);
    expect(screen.getByText('0')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Description'), 'Hello');
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows the count against the limit and updates as the user types', async () => {
    render(<Textarea label="Description" maxLength={280} />);
    expect(screen.getByText('0/280')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Description'), 'EcoDAO');
    expect(screen.getByText('6/280')).toBeInTheDocument();
  });

  it('starts the count from a default value', () => {
    render(<Textarea label="Description" maxLength={280} defaultValue="EcoDAO" />);
    expect(screen.getByText('6/280')).toBeInTheDocument();
  });

  it('counts a controlled value', async () => {
    render(<ControlledTextarea />);

    await userEvent.type(screen.getByLabelText('Description'), 'abc');

    expect(screen.getByLabelText('Description')).toHaveValue('abc');
    expect(screen.getByText('3/10')).toBeInTheDocument();
  });

  it('hides the visible counter from assistive technology', () => {
    render(<Textarea label="Description" maxLength={280} />);
    expect(screen.getByText('0/280')).toHaveAttribute('aria-hidden', 'true');
  });

  it('states the limit once in the accessible description', () => {
    render(<Textarea label="Description" maxLength={280} />);

    expect(screen.getByLabelText('Description')).toHaveAccessibleDescription(
      'Maximum 280 characters'
    );
  });

  it('describes the control with the helper text and the limit', () => {
    render(<Textarea label="Description" helperText="Shown on the card" maxLength={280} />);

    expect(screen.getByLabelText('Description')).toHaveAccessibleDescription(
      'Shown on the card Maximum 280 characters'
    );
  });

  it('stays silent while the limit is far away', async () => {
    render(<Textarea label="Description" maxLength={280} />);

    await userEvent.type(screen.getByLabelText('Description'), 'EcoDAO');

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('announces the characters remaining near the limit', async () => {
    render(<Textarea label="Description" maxLength={10} announceThreshold={5} />);

    await userEvent.type(screen.getByLabelText('Description'), 'abcdef');

    expect(screen.getByRole('status')).toHaveTextContent('4 characters remaining');
  });

  it('uses the singular form for the last remaining character', async () => {
    render(<Textarea label="Description" maxLength={10} announceThreshold={5} />);

    await userEvent.type(screen.getByLabelText('Description'), 'abcdefghi');

    expect(screen.getByRole('status')).toHaveTextContent('1 character remaining');
  });

  it('caps input at maxLength by default', async () => {
    render(<Textarea label="Description" maxLength={5} />);

    const textarea = screen.getByLabelText('Description');
    expect(textarea).toHaveAttribute('maxlength', '5');

    await userEvent.type(textarea, 'abcdefgh');
    expect(textarea).toHaveValue('abcde');
    expect(screen.getByText('5/5')).toBeInTheDocument();
  });

  it('allows overflow and flags it when the limit is not enforced', async () => {
    render(<Textarea label="Description" maxLength={5} enforceMaxLength={false} />);

    const textarea = screen.getByLabelText('Description');
    expect(textarea).not.toHaveAttribute('maxlength');

    await userEvent.type(textarea, 'abcdefg');

    expect(textarea).toHaveValue('abcdefg');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('7/5')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 characters over the limit');
  });

  it('is not marked invalid while within the limit', () => {
    render(<Textarea label="Description" maxLength={5} />);
    expect(screen.getByLabelText('Description')).not.toHaveAttribute('aria-invalid');
  });

  it('announces the error and marks the control invalid', () => {
    render(<Textarea label="Description" error="Description is required" />);

    const textarea = screen.getByLabelText('Description');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Description is required');
    expect(textarea).toHaveAccessibleDescription('Description is required');
  });

  it('marks the control invalid without a message when error is true', () => {
    render(<Textarea label="Description" error />);

    expect(screen.getByLabelText('Description')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('treats an empty error string as no error', () => {
    render(<Textarea label="Description" error="" />);

    expect(screen.getByLabelText('Description')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sets both required and aria-required when required', () => {
    render(<Textarea label="Description" required />);

    const textarea = screen.getByLabelText(/Description/);
    expect(textarea).toBeRequired();
    expect(textarea).toHaveAttribute('aria-required', 'true');
  });

  it('keeps a caller-supplied aria-describedby alongside its own', () => {
    render(
      <>
        <p id="external">Shown elsewhere</p>
        <Textarea label="Description" helperText="Optional" aria-describedby="external" />
      </>
    );

    expect(screen.getByLabelText('Description')).toHaveAccessibleDescription(
      'Shown elsewhere Optional'
    );
  });

  it('reports changes to the caller', async () => {
    const onChange = jest.fn();
    render(<Textarea label="Description" onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Description'), 'Hi');

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('is reachable by keyboard', async () => {
    render(<Textarea label="Description" />);

    await userEvent.tab();
    expect(screen.getByLabelText('Description')).toHaveFocus();
  });

  it('does not accept input while disabled', async () => {
    render(<Textarea label="Description" disabled />);

    const textarea = screen.getByLabelText('Description');
    expect(textarea).toBeDisabled();

    await userEvent.type(textarea, 'EcoDAO');
    expect(textarea).toHaveValue('');
  });

  it('defaults to four rows and accepts an override', () => {
    const { rerender } = render(<Textarea label="Description" />);
    expect(screen.getByLabelText('Description')).toHaveAttribute('rows', '4');

    rerender(<Textarea label="Description" rows={8} />);
    expect(screen.getByLabelText('Description')).toHaveAttribute('rows', '8');
  });

  it('applies className to the control and containerClassName to the wrapper', () => {
    render(<Textarea label="Description" className="tall" containerClassName="span-two" />);

    const textarea = screen.getByLabelText('Description');
    expect(textarea).toHaveClass('tall');
    expect(textarea.closest('.span-two')).not.toBeNull();
  });

  it('forwards a ref to the underlying textarea element', () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea label="Description" ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('passes through arbitrary textarea attributes', () => {
    render(<Textarea label="Description" placeholder="What is this community for?" />);

    expect(screen.getByPlaceholderText('What is this community for?')).toBeInTheDocument();
  });
});
