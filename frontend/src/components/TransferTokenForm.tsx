'use client';

import { useId, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { Alert } from './ui/Alert';
import { AmountInput } from './ui/AmountInput';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Input } from './ui/Input';
import { Select, type SelectOption } from './ui/Select';
import { api } from '@/lib/api';
import { paymentSchema, toFieldErrors } from '@/lib/schemas';
import styles from './TransferTokenForm.module.css';

/** Message shown when a submission is rejected without a usable one. */
const GENERIC_SUBMIT_ERROR = 'Could not send this transfer. Please try again.';

/** How much of an address to show while confirming who is sending. */
const ADDRESS_PREVIEW_LENGTH = 6;

/** An asset the connected account can send. */
export interface TransferAsset {
  /** The code the balance is held under, e.g. `XLM` or `COOP`. */
  assetCode: string;
  /** Issuer of the asset. Omitted for the native currency, which has none. */
  assetIssuer?: string;
  /** Shown after the code so a long issuer is not the only identifier. */
  issuerName?: string;
}

export interface TransferTokenFormProps {
  /** The connected account the transfer is funded from. */
  publicKey: string;
  /** Assets to offer in the dropdown. */
  assets: TransferAsset[];
  /** Called with the transaction hash once the network has accepted it. */
  onSuccess?: (txHash: string) => void;
  /** Disables the asset dropdown while the balances are still loading. */
  isLoadingAssets?: boolean;
  className?: string;
}

/**
 * Key an asset by code *and* issuer: the same code under two issuers is two
 * different assets, so the code alone cannot identify one.
 */
function assetKey(asset: TransferAsset): string {
  return `${asset.assetCode}:${asset.assetIssuer ?? ''}`;
}

/** Human label for an asset, in the dropdown and on the amount field alike. */
function assetLabel(asset: TransferAsset): string {
  return asset.issuerName ? `${asset.assetCode} (${asset.issuerName})` : asset.assetCode;
}

/**
 * Resolves the asset chosen in the dropdown. Returns `null` when the selection
 * matches nothing in `assets`: the options are derived from the same list, so
 * it should not happen, but the result is about to become a payment and cannot
 * be assumed.
 */
function findAsset(assets: TransferAsset[], key: string): TransferAsset | null {
  return assets.find((asset) => assetKey(asset) === key) ?? null;
}

/** Shortens an address for display: first and last few characters. */
function shortenAddress(address: string): string {
  if (address.length <= ADDRESS_PREVIEW_LENGTH * 2 + 1) return address;
  return `${address.slice(0, ADDRESS_PREVIEW_LENGTH)}…${address.slice(-ADDRESS_PREVIEW_LENGTH)}`;
}

/**
 * Form for sending tokens to another account: choose a recipient, an asset and
 * an amount, and the transfer is built, signed in Freighter and submitted.
 *
 * The issuer's secret key never reaches the server. The sequence is:
 *
 * 1. `POST /api/v1/transactions/unsigned` builds the payment envelope, which
 *    is where the source account's current sequence number comes from;
 * 2. Freighter signs that envelope, so the user approves exactly what is about
 *    to be submitted rather than an opaque request;
 * 3. `POST /api/v1/tokens/transfer` hands the signed envelope to the network and
 *    returns the transaction hash.
 *
 * Freighter is imported dynamically for the same reason `useWallet` does: it
 * only exists in the browser, so a module-level import would break the
 * server-rendered pages that mount this form.
 *
 * Accessibility notes:
 *
 * - the fields are design-system primitives, so labels, helper text, errors and
 *   `aria-invalid` / `aria-required` are wired by the primitives themselves;
 *   the bare `AmountInput` gets a real `<label htmlFor>` here, so clicking the
 *   label still focuses the field;
 * - the asset dropdown is a combobox that keeps focus on its trigger and
 *   supports arrows, Home/End, Enter, Escape and typeahead;
 * - progress is announced. Two of the three stages spend their time waiting on
 *   the wallet rather than the network, and a user who cannot see the screen
 *   would otherwise get no signal at all until something finished, so each
 *   stage is reported through a polite `role="status"` region that is always
 *   present in the DOM;
 * - the confirmed hash and a declined signature are both in `role="alert"`
 *   alerts: one is the outcome the user was waiting for, the other a failure
 *   they caused and can fix.
 *
 * @example
 * ```tsx
 * <TransferTokenForm
 *   publicKey={publicKey}
 *   assets={balances.map(toTransferAsset)}
 *   onSuccess={(hash) => toast.success(`Sent ${hash}`)}
 * />
 * ```
 */
export function TransferTokenForm({
  publicKey,
  assets,
  onSuccess,
  isLoadingAssets = false,
  className,
}: TransferTokenFormProps) {
  const amountId = useId();
  const amountHintId = `${amountId}-hint`;

  const [recipient, setRecipient] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);

  const options: SelectOption[] = assets.map((asset) => ({
    value: assetKey(asset),
    label: assetLabel(asset),
  }));

  const selectedAsset = findAsset(assets, selectedKey);
  const amountAsset = selectedAsset ? assetLabel(selectedAsset) : undefined;
  const hasAssets = assets.length > 0;

  /**
   * Commits a progress message synchronously.
   *
   * The step that follows is a wallet prompt or a network call, and it can
   * begin before React would otherwise re-render. Flushing first guarantees
   * the announcement is in the accessibility tree before the wait starts, so
   * a screen reader user hears the stage they are actually in rather than the
   * one they have already left.
   */
  const announceStage = (message: string | null) => {
    flushSync(() => setStage(message));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setTxHash(null);

    const asset = findAsset(assets, selectedKey);

    // Validate the recipient and the amount even when no asset was chosen, so
    // an invalid field is reported on its own control rather than hidden
    // behind the asset error. An empty code both fails the schema and stands
    // in for "nothing selected", hence the override below.
    const parsed = paymentSchema.safeParse({
      senderPublicKey: publicKey,
      destinationPublicKey: recipient.trim(),
      assetCode: asset?.assetCode ?? '',
      assetIssuer: asset?.assetIssuer,
      amount,
    });

    const fieldErrors = parsed.success ? {} : toFieldErrors(parsed.error);

    if (!asset) {
      fieldErrors.assetCode = 'Select an asset to send';
    }

    if (!parsed.success || !asset) {
      setErrors(fieldErrors);
      setStage(null);
      return;
    }

    setErrors({});

    try {
      setStage('Building the transfer…');
      const { xdr } = await api.post<{ xdr: string }>('/api/v1/transactions/unsigned', {
        senderPublicKey: parsed.data.senderPublicKey,
        destinationPublicKey: parsed.data.destinationPublicKey,
        assetCode: parsed.data.assetCode,
        assetIssuer: parsed.data.assetIssuer ?? '',
        amount: parsed.data.amount,
      });

      announceStage('Approve the transfer in your wallet…');
      const { signTransaction } = await import('@stellar/freighter-api');
      const signedXdr = await signTransaction(xdr);

      announceStage('Submitting the signed transfer…');
      const { txHash: submittedHash } = await api.post<{ txHash: string }>(
        '/api/v1/tokens/transfer',
        { signedXdr }
      );

      setStage(null);
      setTxHash(submittedHash);
      setRecipient('');
      setAmount('');
      onSuccess?.(submittedHash);
    } catch (error) {
      setStage(null);
      setSubmitError(
        error instanceof Error && error.message ? error.message : GENERIC_SUBMIT_ERROR
      );
    }
  };

  return (
    <Card className={[styles.card, className].filter(Boolean).join(' ')}>
      <div className={styles.header}>
        <h2 className={styles.title}>Send tokens</h2>
        <p className={styles.subtitle}>
          Transfer an asset to another Stellar account. You will be asked to approve the transaction
          in your wallet before anything is sent.
        </p>
      </div>

      {submitError && <Alert variant="error">{submitError}</Alert>}

      {txHash && (
        <Alert variant="success" title="Transfer submitted">
          <code className={styles.hash}>{txHash}</code>{' '}
          <a
            href={`https://stellar.expert/explorer/tx/${encodeURIComponent(txHash)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Stellar Expert
          </a>
        </Alert>
      )}

      <form onSubmit={(event) => void handleSubmit(event)} className={styles.form} noValidate>
        <Input
          label="Recipient"
          required
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          placeholder="G…"
          helperText="The Stellar address receiving the tokens."
          error={errors.destinationPublicKey}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={!hasAssets}
        />

        <Select
          label="Asset"
          required
          options={options}
          value={selectedKey}
          onChange={setSelectedKey}
          placeholder={hasAssets ? 'Select an asset' : 'No assets available'}
          helperText="The assets this account can currently send."
          error={errors.assetCode}
          disabled={isLoadingAssets || !hasAssets}
        />

        <div className={styles.field}>
          <label htmlFor={amountId} className={styles.label}>
            Amount
            <span aria-hidden="true" className={styles.requiredMark}>
              *
            </span>
          </label>
          <AmountInput
            id={amountId}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            asset={amountAsset}
            aria-describedby={amountHintId}
            aria-required="true"
            aria-invalid={errors.amount ? true : undefined}
            placeholder="0.00"
            disabled={!hasAssets}
          />
          <span
            id={amountHintId}
            role={errors.amount ? 'alert' : undefined}
            className={errors.amount ? styles.error : styles.helper}
          >
            {errors.amount ?? 'With up to 7 decimal places.'}
          </span>
        </div>

        <p className={styles.sender}>
          Sending from <code>{shortenAddress(publicKey)}</code>
        </p>

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={stage !== null}
            loadingLabel="Transfer in progress"
            disabled={!hasAssets}
          >
            Send
          </Button>
        </div>

        {/*
          Always rendered, so the region is in the accessibility tree before the
          first stage begins; otherwise there is nothing for the first
          announcement to attach to.
        */}
        <p role="status" aria-live="polite" className={styles.status}>
          {stage ?? ''}
        </p>
      </form>
    </Card>
  );
}
