import {
  Asset,
  FeeBumpTransaction,
  Memo,
  Operation,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { StellarService } from './stellar';

const STROOPS_PER_XLM = 10_000_000;

/** Base64 alphabet with optional `=` padding; anything else cannot be an XDR envelope. */
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/** Raised when an envelope cannot be decoded. The message is always human-readable. */
export class XdrDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XdrDecodeError';
  }
}

export interface DeserializeXdrOptions {
  /**
   * Network passphrase the envelope belongs to.
   * Defaults to the network the configured Horizon instance runs on.
   */
  networkPassphrase?: string;
}

export interface XdrMemoDetails {
  type: 'none' | 'text' | 'id' | 'hash' | 'return';
  /** Decoded memo content: UTF-8 for text, decimal for id, hex for hash/return. */
  value: string | null;
}

export interface XdrTimeBoundsDetails {
  /** Seconds since the Unix epoch, as reported by the envelope. */
  minTime: string;
  maxTime: string;
  /** ISO 8601 rendering, or `null` when the bound is unset (`0`). */
  minTimeIso: string | null;
  maxTimeIso: string | null;
}

export interface XdrOperationDetails {
  index: number;
  type: string;
  /** Per-operation source, or `null` when the operation inherits the transaction source. */
  sourceAccount: string | null;
  /** One-line plain-language description of the operation. */
  summary: string;
  destination?: string;
  asset?: string;
  amount?: string;
  limit?: string;
  startingBalance?: string;
  name?: string;
}

export interface XdrFeeBumpDetails {
  feeSource: string;
  fee: string;
  feeXlm: string;
  hash: string;
}

export interface XdrTransactionDetails {
  envelopeType: 'transaction' | 'feeBumpTransaction';
  /** Hash of the inner transaction, hex encoded. */
  hash: string;
  networkPassphrase: string;
  sourceAccount: string;
  sequence: string;
  /** Total fee in stroops, as encoded in the envelope. */
  fee: string;
  /** The same fee expressed in XLM, to seven decimal places. */
  feeXlm: string;
  memo: XdrMemoDetails;
  timeBounds: XdrTimeBoundsDetails | null;
  operationCount: number;
  operations: XdrOperationDetails[];
  signatureCount: number;
  /** Four-byte signature hints, hex encoded, in envelope order. */
  signatureHints: string[];
  /** One-line plain-language description of the whole envelope. */
  summary: string;
  /** Present only when the envelope is a fee bump. */
  feeBump?: XdrFeeBumpDetails;
}

/**
 * Turns a Stellar SDK decoding failure into an actionable message. The SDK
 * surfaces low-level XDR reader errors ("XDR Read Error: Bad union switch: 42")
 * that mean nothing to an API consumer, so they are mapped to plain language.
 */
function describeDecodeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/bad union switch/i.test(message)) {
    return 'XDR envelope type is not recognised. Expected a transaction or fee-bump transaction envelope.';
  }

  if (/invalid character|base64|non-canonical/i.test(message)) {
    return 'XDR is not valid base64. Expected a base64-encoded transaction envelope.';
  }

  if (/xdr read error|remaining bytes|unexpected end|length/i.test(message)) {
    return 'XDR could not be decoded. The envelope is malformed or truncated.';
  }

  return `XDR could not be decoded: ${message}`;
}

function stroopsToXlm(stroops: string | number): string {
  return (Number(stroops) / STROOPS_PER_XLM).toFixed(7);
}

function toIso(unixSeconds: string): string | null {
  const seconds = Number(unixSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

/** Renders an account so a human can recognise it without reading 56 characters. */
function abbreviate(accountId: string): string {
  return accountId.length > 12 ? `${accountId.slice(0, 4)}...${accountId.slice(-4)}` : accountId;
}

/** `XLM` for the native asset, `CODE:ISSUER` otherwise. */
function formatAsset(asset: unknown): string {
  if (asset instanceof Asset) {
    return asset.isNative() ? 'XLM' : `${asset.getCode()}:${asset.getIssuer()}`;
  }

  if (typeof asset === 'object' && asset !== null && 'code' in asset) {
    const { code, issuer } = asset as { code: string; issuer?: string };
    return issuer ? `${code}:${issuer}` : code;
  }

  return 'unknown asset';
}

function formatAssetForSummary(asset: unknown): string {
  const formatted = formatAsset(asset);
  const [code, issuer] = formatted.split(':');
  return issuer ? `${code} (${abbreviate(issuer)})` : code;
}

function decodeMemo(memo: Memo): XdrMemoDetails {
  const value: unknown = memo.value;

  switch (memo.type) {
    case 'text':
      return {
        type: 'text',
        value: Buffer.isBuffer(value) ? value.toString('utf8') : String(value ?? ''),
      };
    case 'id':
      return { type: 'id', value: String(value ?? '') };
    case 'hash':
    case 'return':
      return {
        type: memo.type,
        value: Buffer.isBuffer(value) ? value.toString('hex') : String(value ?? ''),
      };
    default:
      return { type: 'none', value: null };
  }
}

type ParsedOperation = Operation & Record<string, unknown>;

function readString(operation: ParsedOperation, key: string): string | undefined {
  const value = operation[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Describes a single parsed operation. Operations the Stellar protocol supports
 * but CoopLumen does not build fall through to a readable default rather than
 * being dropped, so callers always see the whole envelope.
 */
function describeOperation(operation: ParsedOperation, index: number): XdrOperationDetails {
  const base: XdrOperationDetails = {
    index,
    type: operation.type,
    sourceAccount: operation.source ?? null,
    summary: `${operation.type} operation`,
  };

  switch (operation.type) {
    case 'payment': {
      const amount = readString(operation, 'amount') ?? '0';
      const destination = readString(operation, 'destination') ?? '';
      return {
        ...base,
        asset: formatAsset(operation.asset),
        amount,
        destination,
        summary: `Send ${amount} ${formatAssetForSummary(operation.asset)} to ${abbreviate(destination)}`,
      };
    }

    case 'createAccount': {
      const destination = readString(operation, 'destination') ?? '';
      const startingBalance = readString(operation, 'startingBalance') ?? '0';
      return {
        ...base,
        destination,
        startingBalance,
        asset: 'XLM',
        summary: `Create account ${abbreviate(destination)} funded with ${startingBalance} XLM`,
      };
    }

    case 'changeTrust': {
      const limit = readString(operation, 'limit') ?? '';
      const removingTrustline = Number(limit) === 0;
      return {
        ...base,
        asset: formatAsset(operation.line),
        limit,
        summary: removingTrustline
          ? `Remove trustline for ${formatAssetForSummary(operation.line)}`
          : `Trust ${formatAssetForSummary(operation.line)} up to ${limit}`,
      };
    }

    case 'pathPaymentStrictSend':
    case 'pathPaymentStrictReceive': {
      const destination = readString(operation, 'destination') ?? '';
      const amount =
        readString(operation, 'sendAmount') ?? readString(operation, 'destAmount') ?? '0';
      return {
        ...base,
        destination,
        asset: formatAsset(operation.destAsset),
        amount,
        summary: `Path payment of ${amount} ${formatAssetForSummary(operation.sendAsset)} to ${abbreviate(destination)} as ${formatAssetForSummary(operation.destAsset)}`,
      };
    }

    case 'accountMerge': {
      const destination = readString(operation, 'destination') ?? '';
      return { ...base, destination, summary: `Merge account into ${abbreviate(destination)}` };
    }

    case 'manageData': {
      const name = readString(operation, 'name') ?? '';
      return {
        ...base,
        name,
        summary:
          operation.value === null ? `Delete data entry "${name}"` : `Set data entry "${name}"`,
      };
    }

    case 'setOptions':
      return { ...base, summary: 'Set account options' };

    case 'bumpSequence':
      return {
        ...base,
        summary: `Bump sequence number to ${readString(operation, 'bumpTo') ?? 'unknown'}`,
      };

    default:
      return base;
  }
}

function summarise(
  operations: XdrOperationDetails[],
  sourceAccount: string,
  memo: XdrMemoDetails
): string {
  const head =
    operations.length === 1
      ? operations[0].summary
      : `${operations.length} operations from ${abbreviate(sourceAccount)}`;

  const memoSuffix = memo.type === 'text' && memo.value ? ` (memo: ${memo.value})` : '';
  return `${head}${memoSuffix}`;
}

function describeTransaction(
  transaction: Transaction,
  networkPassphrase: string
): XdrTransactionDetails {
  const operations = transaction.operations.map((operation, index) =>
    describeOperation(operation as ParsedOperation, index)
  );
  const memo = decodeMemo(transaction.memo);
  const bounds = transaction.timeBounds;

  return {
    envelopeType: 'transaction',
    hash: transaction.hash().toString('hex'),
    networkPassphrase,
    sourceAccount: transaction.source,
    sequence: transaction.sequence,
    fee: String(transaction.fee),
    feeXlm: stroopsToXlm(transaction.fee),
    memo,
    timeBounds: bounds
      ? {
          minTime: bounds.minTime,
          maxTime: bounds.maxTime,
          minTimeIso: toIso(bounds.minTime),
          maxTimeIso: toIso(bounds.maxTime),
        }
      : null,
    operationCount: operations.length,
    operations,
    signatureCount: transaction.signatures.length,
    signatureHints: transaction.signatures.map((signature) => signature.hint().toString('hex')),
    summary: summarise(operations, transaction.source, memo),
  };
}

/**
 * Decodes a base64 transaction envelope into human-readable details, so a
 * wallet-signed payload can be shown to a reviewer, or logged, without anyone
 * having to read raw XDR.
 *
 * Fee-bump envelopes are unwrapped: the returned details describe the inner
 * transaction, with the outer fee source and fee reported under `feeBump`.
 *
 * @throws {XdrDecodeError} when the input is not a decodable envelope. The
 * error message is always plain language, never a raw SDK reader error.
 */
export function deserializeXdr(
  xdr: unknown,
  options: DeserializeXdrOptions = {}
): XdrTransactionDetails {
  if (typeof xdr !== 'string') {
    throw new XdrDecodeError('XDR must be a string.');
  }

  const trimmed = xdr.trim();
  if (trimmed.length === 0) {
    throw new XdrDecodeError('XDR is required and cannot be empty.');
  }

  if (!BASE64_PATTERN.test(trimmed)) {
    throw new XdrDecodeError(
      'XDR is not valid base64. Expected a base64-encoded transaction envelope.'
    );
  }

  const networkPassphrase = options.networkPassphrase ?? StellarService.getNetwork();

  let envelope: Transaction | FeeBumpTransaction;
  try {
    envelope = TransactionBuilder.fromXDR(trimmed, networkPassphrase);
  } catch (error) {
    throw new XdrDecodeError(describeDecodeError(error));
  }

  if (envelope instanceof FeeBumpTransaction) {
    const inner = describeTransaction(envelope.innerTransaction, networkPassphrase);
    return {
      ...inner,
      envelopeType: 'feeBumpTransaction',
      feeBump: {
        feeSource: envelope.feeSource,
        fee: String(envelope.fee),
        feeXlm: stroopsToXlm(envelope.fee),
        hash: envelope.hash().toString('hex'),
      },
      summary: `${inner.summary}, fee-bumped by ${abbreviate(envelope.feeSource)}`,
    };
  }

  return describeTransaction(envelope, networkPassphrase);
}
