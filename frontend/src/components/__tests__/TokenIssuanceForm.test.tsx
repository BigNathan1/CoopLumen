import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TokenIssuanceForm } from '../TokenIssuanceForm';

/** A syntactically valid Stellar account, as the address schema accepts. */
const ISSUER = `G${'A'.repeat(55)}`;

/**
 * Fills every field with valid values.
 *
 * Sequential on purpose: `userEvent` keeps its own document-level state, so
 * two `type` calls running at once interleave their keystrokes across fields.
 */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/asset code/i), 'ECO');
  await user.type(screen.getByLabelText(/amount/i), '1000');
  await user.type(screen.getByLabelText(/description/i), 'Membership shares');
}

describe('TokenIssuanceForm', () => {
  it('renders a control for each of the asset code, amount and description', () => {
    render(<TokenIssuanceForm onSubmit={jest.fn()} />);

    expect(screen.getByLabelText(/asset code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it('submits the entered values', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<TokenIssuanceForm onSubmit={onSubmit} />);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /issue token/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        assetCode: 'ECO',
        amount: '1000',
        description: 'Membership shares',
      })
    );
  });

  it('omits an empty description rather than submitting a blank one', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<TokenIssuanceForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/asset code/i), 'ECO');
    await user.type(screen.getByLabelText(/amount/i), '1');
    await user.click(screen.getByRole('button', { name: /issue token/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        assetCode: 'ECO',
        amount: '1',
        description: undefined,
      })
    );
  });

  it('shows the issuing account when one is given, and omits it when not', () => {
    const { rerender } = render(
      <TokenIssuanceForm onSubmit={jest.fn()} issuerPublicKey={ISSUER} />
    );
    expect(screen.getByText(ISSUER)).toBeInTheDocument();

    rerender(<TokenIssuanceForm onSubmit={jest.fn()} />);
    expect(screen.queryByText(ISSUER)).not.toBeInTheDocument();
  });

  describe('validation', () => {
    it('reports a bad asset code on the asset code field', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn();
      render(<TokenIssuanceForm onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText(/asset code/i), 'ECOP!');
      await user.click(screen.getByRole('button', { name: /issue token/i }));

      expect(
        await screen.findByText('Asset code must be letters and numbers only')
      ).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('rejects an empty submission rather than issuing nothing', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn();
      render(<TokenIssuanceForm onSubmit={onSubmit} />);

      await user.click(screen.getByRole('button', { name: /issue token/i }));

      expect(await screen.findByText('Asset code is required')).toBeInTheDocument();
      expect(screen.getByText('Amount is required')).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('rejects a zero amount', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn();
      render(<TokenIssuanceForm onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText(/asset code/i), 'ECO');
      await user.type(screen.getByLabelText(/amount/i), '0');
      await user.click(screen.getByRole('button', { name: /issue token/i }));

      expect(await screen.findByText('Amount must be greater than zero')).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('clears a field error once the field becomes valid', async () => {
      const user = userEvent.setup();
      render(<TokenIssuanceForm onSubmit={jest.fn()} />);

      await user.click(screen.getByRole('button', { name: /issue token/i }));
      expect(await screen.findByText('Asset code is required')).toBeInTheDocument();

      await user.type(screen.getByLabelText(/asset code/i), 'ECO');
      await user.type(screen.getByLabelText(/amount/i), '5');
      await user.click(screen.getByRole('button', { name: /issue token/i }));

      await waitFor(() =>
        expect(screen.queryByText('Asset code is required')).not.toBeInTheDocument()
      );
    });
  });

  describe('failures', () => {
    it('announces the reason a rejected submission gave', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn().mockRejectedValue(new Error('Issuer account not funded.'));
      render(<TokenIssuanceForm onSubmit={onSubmit} />);

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /issue token/i }));

      expect(await screen.findByText('Issuer account not funded.')).toBeInTheDocument();
    });

    it('falls back to a generic message when the rejection carries none', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn().mockRejectedValue(new Error(''));
      render(<TokenIssuanceForm onSubmit={onSubmit} />);

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /issue token/i }));

      expect(
        await screen.findByText('Could not issue this token. Please try again.')
      ).toBeInTheDocument();
    });

    it('keeps what was typed so a failed submission can be corrected', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn().mockRejectedValue(new Error('Try again'));
      render(<TokenIssuanceForm onSubmit={onSubmit} />);

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /issue token/i }));
      await screen.findByText('Try again');

      expect(screen.getByLabelText(/asset code/i)).toHaveValue('ECO');
      expect(screen.getByLabelText(/amount/i)).toHaveValue('1000');
    });
  });

  describe('accessibility', () => {
    it('associates every label with its control', () => {
      render(<TokenIssuanceForm onSubmit={jest.fn()} />);

      expect(screen.getByLabelText(/asset code/i).tagName).toBe('INPUT');
      expect(screen.getByLabelText(/amount/i).tagName).toBe('INPUT');
      expect(screen.getByLabelText(/description/i).tagName).toBe('TEXTAREA');
    });

    it('marks the required fields with aria-required and a decorative asterisk', () => {
      render(<TokenIssuanceForm onSubmit={jest.fn()} />);

      expect(screen.getByLabelText(/asset code/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/amount/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/description/i)).not.toHaveAttribute('aria-required');

      const marks = screen.getAllByText('*');
      expect(marks.length).toBeGreaterThan(0);
      for (const mark of marks) {
        expect(mark).toHaveAttribute('aria-hidden', 'true');
      }
    });

    it('links each field to its hint through aria-describedby', () => {
      render(<TokenIssuanceForm onSubmit={jest.fn()} />);

      const assetCode = screen.getByLabelText(/asset code/i);
      const describedBy = assetCode.getAttribute('aria-describedby') as string;
      expect(document.getElementById(describedBy)).toHaveTextContent('1-12 letters and numbers');
    });

    it('links the amount field to its error and flags it as invalid', async () => {
      const user = userEvent.setup();
      render(<TokenIssuanceForm onSubmit={jest.fn()} />);

      await user.click(screen.getByRole('button', { name: /issue token/i }));

      const amount = await screen.findByLabelText(/amount/i);
      await waitFor(() => expect(amount).toHaveAttribute('aria-invalid', 'true'));
      expect(
        document.getElementById(amount.getAttribute('aria-describedby') as string)
      ).toHaveTextContent('Amount is required');
    });

    it('keeps the fields in source order for keyboard navigation', async () => {
      const user = userEvent.setup();
      render(<TokenIssuanceForm onSubmit={jest.fn()} />);

      await user.tab();
      expect(screen.getByLabelText(/asset code/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByLabelText(/amount/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByLabelText(/description/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', { name: /issue token/i })).toHaveFocus();
    });

    it('submits from the keyboard', async () => {
      const user = userEvent.setup();
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      render(<TokenIssuanceForm onSubmit={onSubmit} />);

      await fillValidForm(user);
      await user.tab();
      await user.keyboard('{Enter}');

      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    });

    it('disables the controls and reports the wait while submitting', () => {
      render(<TokenIssuanceForm onSubmit={jest.fn()} isLoading />);

      const submit = screen.getByRole('button', { name: /issue token/i });
      expect(submit).toBeDisabled();
      expect(submit).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByLabelText(/asset code/i)).toBeDisabled();
    });
  });

  describe('the amount field', () => {
    it('shows the asset code as a suffix once it is a usable one', async () => {
      const user = userEvent.setup();
      render(<TokenIssuanceForm onSubmit={jest.fn()} />);

      expect(screen.queryByText('ECO')).not.toBeInTheDocument();

      await user.type(screen.getByLabelText(/asset code/i), 'ECO');

      expect(screen.getByText('ECO')).toBeInTheDocument();
    });

    it('keeps only a fixed-point amount, to seven places', async () => {
      const user = userEvent.setup();
      render(<TokenIssuanceForm onSubmit={jest.fn()} />);

      const amount = screen.getByLabelText(/amount/i);
      await user.type(amount, '12.123456789');

      expect(amount).toHaveValue('12.1234567');
    });
  });
});
