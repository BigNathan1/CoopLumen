import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AmountInput, sanitizeAmountInput } from '../ui/AmountInput';

describe('sanitizeAmountInput', () => {
  it('passes an already-valid amount through unchanged', () => {
    expect(sanitizeAmountInput('123.45', 7)).toBe('123.45');
  });

  it('strips non-numeric characters', () => {
    expect(sanitizeAmountInput('abc123', 7)).toBe('123');
    expect(sanitizeAmountInput('$1,234', 7)).toBe('1234');
  });

  it('keeps only the first decimal point', () => {
    expect(sanitizeAmountInput('1.2.3.4', 7)).toBe('1.234');
  });

  it('truncates the fractional part to the given number of decimals', () => {
    expect(sanitizeAmountInput('1.23456789', 7)).toBe('1.2345678');
    expect(sanitizeAmountInput('1.999', 2)).toBe('1.99');
  });

  it('leaves a fractional part within the limit untouched', () => {
    expect(sanitizeAmountInput('1.5', 7)).toBe('1.5');
  });

  it('strips the decimal point entirely when decimals is 0', () => {
    expect(sanitizeAmountInput('123.456', 0)).toBe('123');
  });

  it('handles an empty string', () => {
    expect(sanitizeAmountInput('', 7)).toBe('');
  });

  it('leaves a lone trailing decimal point as-is (valid intermediate typing state)', () => {
    expect(sanitizeAmountInput('123.', 7)).toBe('123.');
  });

  it('leaves a leading decimal point as-is (valid intermediate typing state)', () => {
    expect(sanitizeAmountInput('.5', 7)).toBe('.5');
  });
});

describe('AmountInput', () => {
  it('renders a text input with a decimal input mode, not type=number', () => {
    render(<AmountInput aria-label="Amount" />);
    const input = screen.getByLabelText('Amount');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputmode', 'decimal');
  });

  it('sanitizes pasted/typed input beyond the configured decimal precision', async () => {
    const user = userEvent.setup();
    render(<AmountInput aria-label="Amount" decimals={2} />);
    const input = screen.getByLabelText('Amount') as HTMLInputElement;

    await user.type(input, '19.999');

    expect(input.value).toBe('19.99');
  });

  it('defaults to 7 decimal places, matching the app-wide Stellar amount precision', async () => {
    const user = userEvent.setup();
    render(<AmountInput aria-label="Amount" />);
    const input = screen.getByLabelText('Amount') as HTMLInputElement;

    await user.type(input, '1.123456789');

    expect(input.value).toBe('1.1234567');
  });

  it('rejects non-numeric characters as they are typed', async () => {
    const user = userEvent.setup();
    render(<AmountInput aria-label="Amount" />);
    const input = screen.getByLabelText('Amount') as HTMLInputElement;

    await user.type(input, 'abc12x3');

    expect(input.value).toBe('123');
  });

  it('calls the caller-supplied onChange with the sanitized value already applied', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    render(<AmountInput aria-label="Amount" decimals={2} onChange={handleChange} />);
    const input = screen.getByLabelText('Amount');

    await user.type(input, '1.999');

    const lastCall = handleChange.mock.calls.at(-1);
    expect(lastCall?.[0].target.value).toBe('1.99');
  });

  it('renders the asset suffix', () => {
    render(<AmountInput aria-label="Amount" asset="XLM" />);
    expect(screen.getByText('XLM')).toBeInTheDocument();
  });

  it('renders no suffix element when asset is omitted', () => {
    const { container } = render(<AmountInput aria-label="Amount" />);
    expect(container.querySelector('span')).toBeNull();
  });

  it('describes the input with the asset suffix for assistive technology', () => {
    render(<AmountInput aria-label="Amount" asset="USDC" />);
    const input = screen.getByLabelText('Amount');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const suffix = document.getElementById(describedBy!.split(' ')[0]);
    expect(suffix).toHaveTextContent('USDC');
  });

  it('merges a caller-supplied aria-describedby with the asset suffix id', () => {
    render(
      <>
        <span id="hint">Enter the amount to send</span>
        <AmountInput aria-label="Amount" asset="XLM" aria-describedby="hint" />
      </>
    );
    const input = screen.getByLabelText('Amount');
    const describedBy = input.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(describedBy).toContain('hint');
    expect(describedBy.length).toBe(2);
  });

  it('forwards ref to the underlying input element (react-hook-form compatibility)', () => {
    const ref = createRef<HTMLInputElement>();
    render(<AmountInput aria-label="Amount" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('forwards standard input props such as disabled, placeholder, and name', () => {
    render(
      <AmountInput aria-label="Amount" disabled placeholder="0.00" name="amount" />
    );
    const input = screen.getByLabelText('Amount');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('placeholder', '0.00');
    expect(input).toHaveAttribute('name', 'amount');
  });

  it('surfaces aria-invalid when passed, e.g. by FormField on a validation error', () => {
    render(<AmountInput aria-label="Amount" aria-invalid />);
    expect(screen.getByLabelText('Amount')).toHaveAttribute('aria-invalid', 'true');
  });

  it('works as a FormField render-prop child, spreading id/aria attributes like a plain input', () => {
    // Mirrors FormField's contract: id, aria-invalid, aria-required and
    // aria-describedby are spread onto whatever control the caller renders.
    render(
      <AmountInput
        id="amount-field"
        aria-invalid={false}
        aria-required
        aria-describedby="amount-field-description"
        asset="XLM"
        name="amount"
      />
    );
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('id', 'amount-field');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input.getAttribute('aria-describedby')).toContain('amount-field-description');
  });

  it('does not mutate the raw value when it is already valid', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();
    render(<AmountInput aria-label="Amount" onChange={handleChange} />);
    const input = screen.getByLabelText('Amount');

    await user.type(input, '42');

    expect((input as HTMLInputElement).value).toBe('42');
  });
});
