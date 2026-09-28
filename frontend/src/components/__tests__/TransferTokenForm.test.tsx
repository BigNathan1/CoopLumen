import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransferTokenForm, type TransferAsset } from '../TransferTokenForm';
import { api } from '@/lib/api';

const SENDER = `G${'A'.repeat(55)}`;
const RECIPIENT = `G${'B'.repeat(55)}`;
const COMMUNITY_TOKEN_ISSUER = `G${'C'.repeat(55)}`;

const ASSETS: TransferAsset[] = [
  { assetCode: 'XLM' },
  { assetCode: 'ECO', assetIssuer: COMMUNITY_TOKEN_ISSUER, issuerName: 'EcoDAO' },
];

const signTransaction = jest.fn<Promise<string>, [string]>();
const unsigned = { xdr: 'unsigned-xdr' };
const submittedHash = 'a'.repeat(64);

jest.mock('@stellar/freighter-api', () => ({
  signTransaction: (...args: unknown[]) => signTransaction(...(args as [string])),
}));

const post = jest.spyOn(api, 'post');

/** Picks an asset, then fills in a recipient and an amount. */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/recipient/i), RECIPIENT);
  await user.click(screen.getByRole('combobox', { name: /asset/i }));
  await user.click(screen.getByRole('option', { name: 'ECO (EcoDAO)' }));
  await user.type(screen.getByLabelText(/amount/i), '25');
}

function renderForm(overrides: Partial<React.ComponentProps<typeof TransferTokenForm>> = {}) {
  return render(<TransferTokenForm publicKey={SENDER} assets={ASSETS} {...overrides} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  signTransaction.mockResolvedValue('signed-xdr');
  post.mockImplementation(async (path: string) => {
    if (path === '/api/v1/transactions/unsigned') return unsigned;
    if (path === '/api/v1/tokens/transfer') return { txHash: submittedHash };
    throw new Error(`Unexpected request to ${path}`);
  });
});

describe('TransferTokenForm', () => {
  it('offers every asset in the selector', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('combobox', { name: /asset/i }));

    expect(screen.getByRole('option', { name: 'XLM' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'ECO (EcoDAO)' })).toBeInTheDocument();
  });

  it('builds the XDR, has Freighter sign it, and submits the signed envelope', async () => {
    const user = userEvent.setup();
    const onSuccess = jest.fn();
    renderForm({ onSuccess });

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(submittedHash));

    expect(post).toHaveBeenNthCalledWith(1, '/api/v1/transactions/unsigned', {
      senderPublicKey: SENDER,
      destinationPublicKey: RECIPIENT,
      assetCode: 'ECO',
      assetIssuer: COMMUNITY_TOKEN_ISSUER,
      amount: '25',
    });
    expect(signTransaction).toHaveBeenCalledWith('unsigned-xdr');
    expect(post).toHaveBeenNthCalledWith(2, '/api/v1/tokens/transfer', {
      signedXdr: 'signed-xdr',
    });
  });

  it('sends an empty issuer for the native currency, which has none', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/recipient/i), RECIPIENT);
    await user.click(screen.getByRole('combobox', { name: /asset/i }));
    await user.click(screen.getByRole('option', { name: 'XLM' }));
    await user.type(screen.getByLabelText(/amount/i), '1');
    await user.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/api/v1/transactions/unsigned',
        expect.objectContaining({ assetCode: 'XLM', assetIssuer: '' })
      )
    );
  });

  it('shows the submitted hash and a link to the explorer', async () => {
    const user = userEvent.setup();
    renderForm();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText(submittedHash)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /stellar expert/i })).toHaveAttribute(
      'href',
      `https://stellar.expert/explorer/tx/${submittedHash}`
    );
  });

  it('clears the form once the transfer is on its way', async () => {
    const user = userEvent.setup();
    renderForm();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText(submittedHash);
    expect(screen.getByLabelText(/recipient/i)).toHaveValue('');
    expect(screen.getByLabelText(/amount/i)).toHaveValue('');
  });

  it('does not build anything when the wallet declines to sign', async () => {
    const user = userEvent.setup();
    signTransaction.mockRejectedValue(new Error('User declined to sign'));
    renderForm();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText('User declined to sign')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalledWith('/api/v1/tokens/transfer', expect.anything());
  });

  it('reports a rejected build without asking the wallet to sign', async () => {
    const user = userEvent.setup();
    post.mockRejectedValueOnce(new Error('Source account not found.'));
    renderForm();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^send$/i }));

    expect(await screen.findByText('Source account not found.')).toBeInTheDocument();
    expect(signTransaction).not.toHaveBeenCalled();
  });

  it('reports a failure that carries no message', async () => {
    const user = userEvent.setup();
    post.mockRejectedValueOnce(new Error(''));
    renderForm();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^send$/i }));

    expect(
      await screen.findByText('Could not send this transfer. Please try again.')
    ).toBeInTheDocument();
  });

  describe('validation', () => {
    it('reports a recipient that is not a Stellar public key', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText(/recipient/i), 'nope');
      await user.click(screen.getByRole('button', { name: /^send$/i }));

      expect(
        await screen.findByText('Enter a valid Stellar public key (starts with G, 56 characters)')
      ).toBeInTheDocument();
      expect(post).not.toHaveBeenCalled();
    });

    it('reports a missing amount', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText(/recipient/i), RECIPIENT);
      await user.click(screen.getByRole('combobox', { name: /asset/i }));
      await user.click(screen.getByRole('option', { name: 'XLM' }));
      await user.click(screen.getByRole('button', { name: /^send$/i }));

      expect(await screen.findByText('Amount is required')).toBeInTheDocument();
      expect(post).not.toHaveBeenCalled();
    });

    it('reports that no asset was chosen', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.type(screen.getByLabelText(/recipient/i), RECIPIENT);
      await user.type(screen.getByLabelText(/amount/i), '5');
      await user.click(screen.getByRole('button', { name: /^send$/i }));

      expect(await screen.findByText('Select an asset to send')).toBeInTheDocument();
      expect(post).not.toHaveBeenCalled();
    });

    it('flags the invalid field with aria-invalid', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(screen.getByRole('button', { name: /^send$/i }));

      await waitFor(() =>
        expect(screen.getByLabelText(/recipient/i)).toHaveAttribute('aria-invalid', 'true')
      );
    });
  });

  describe('with nothing to send', () => {
    it('disables the form and says why', () => {
      renderForm({ assets: [] });

      expect(screen.getByText('No assets available')).toBeInTheDocument();
      expect(screen.getByLabelText(/recipient/i)).toBeDisabled();
      expect(screen.getByLabelText(/amount/i)).toBeDisabled();
      expect(screen.getByRole('button', { name: /^send$/i })).toBeDisabled();
    });

    it('disables only the asset selector while balances are still loading', () => {
      renderForm({ isLoadingAssets: true });

      expect(screen.getByRole('combobox', { name: /asset/i })).toBeDisabled();
      expect(screen.getByLabelText(/recipient/i)).toBeEnabled();
    });
  });

  describe('accessibility', () => {
    it('associates every label with its control', () => {
      renderForm();

      expect(screen.getByLabelText(/recipient/i).tagName).toBe('INPUT');
      expect(screen.getByRole('combobox', { name: /asset/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/amount/i).tagName).toBe('INPUT');
    });

    it('marks the required fields and hides the asterisks from assistive tech', () => {
      renderForm();

      expect(screen.getByLabelText(/recipient/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/amount/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByRole('combobox', { name: /asset/i })).toHaveAttribute(
        'aria-required',
        'true'
      );

      for (const mark of screen.getAllByText('*')) {
        expect(mark).toHaveAttribute('aria-hidden', 'true');
      }
    });

    it('reaches the controls by tabbing in source order', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.tab();
      expect(screen.getByLabelText(/recipient/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('combobox', { name: /asset/i })).toHaveFocus();

      await user.tab();
      expect(screen.getByLabelText(/amount/i)).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', { name: /^send$/i })).toHaveFocus();
    });

    it('announces each stage of the sequence in a polite live region', async () => {
      const user = userEvent.setup();
      renderForm();

      // The shared Button also renders a role="status" span, so pick out the
      // progress region by its own live-region attribute.
      const status = document.querySelector('[aria-live="polite"]') as HTMLElement;
      expect(status.tagName).toBe('P');
      expect(status).toHaveAttribute('role', 'status');
      // Present before the transfer starts, so the first update is announced.
      expect(status.textContent).toBe('');

      const seen: string[] = [];
      signTransaction.mockImplementation(async () => {
        seen.push(status.textContent ?? '');
        return 'signed-xdr';
      });

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /^send$/i }));

      await waitFor(() => expect(screen.getByText(submittedHash)).toBeInTheDocument());
      expect(seen.join(' ')).toContain('Approve the transfer in your wallet');
    });

    it('disables the submit button and reports the wait while in flight', async () => {
      const user = userEvent.setup();
      let release: (value: string) => void = () => undefined;
      signTransaction.mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            release = resolve;
          })
      );
      renderForm();

      await fillValidForm(user);
      await user.click(screen.getByRole('button', { name: /^send$/i }));

      const busy = await screen.findByRole('button', { name: /transfer in progress/i });
      expect(busy).toBeDisabled();
      expect(busy).toHaveAttribute('aria-busy', 'true');

      release('signed-xdr');
      await waitFor(() => expect(screen.getByText(submittedHash)).toBeInTheDocument());
    });
  });
});
