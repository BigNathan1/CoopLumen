import {
  Horizon,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  BASE_FEE,
} from '@stellar/stellar-sdk';

export interface SignerSpec {
  publicKey: string;
  weight: number; // 1–255
}

export interface SetAccountSignersOptions {
  server: Horizon.Server;
  networkPassphrase?: string;
  thresholds?: { low: number; med: number; high: number };
  masterWeight?: number;
}

export class StellarMultisigError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'StellarMultisigError';
  }
}

export function mapHorizonMultisigError(err: unknown): StellarMultisigError {
  const extras = (err as any)?.response?.data?.extras;
  const opCodes: string[] = extras?.result_codes?.operations ?? [];
  const txCode: string | undefined = extras?.result_codes?.transaction;

  if (opCodes.includes('op_too_many_subentries')) {
    return new StellarMultisigError('TOO_MANY_SIGNERS', 'Account has reached the maximum number of Stellar signers/subentries.', err);
  }
  if (opCodes.includes('op_bad_threshold') || opCodes.includes('op_threshold_out_of_range')) {
    return new StellarMultisigError('INVALID_THRESHOLDS', 'Threshold values are out of range (0–255) or exceed total signer weight.', err);
  }
  if (txCode === 'tx_bad_auth') {
    return new StellarMultisigError('INSUFFICIENT_SIGNATURE', 'Transaction lacks sufficient signer weight to modify account signers.', err);
  }
  if (txCode === 'tx_insufficient_balance') {
    return new StellarMultisigError('INSUFFICIENT_RESERVE', 'Treasury account lacks enough XLM reserve to add new signers.', err);
  }
  if ((err as any)?.response?.status === 404) {
    return new StellarMultisigError('ACCOUNT_NOT_FOUND', 'Treasury Stellar account does not exist on the configured network.', err);
  }
  return new StellarMultisigError(
    'STELLAR_SUBMIT_FAILED',
    err instanceof Error ? err.message : 'Failed to update Stellar account signers.',
    err,
  );
}

export async function setAccountSigners(
  accountKeypair: Keypair,
  signers: SignerSpec[],
  options: SetAccountSignersOptions,
): Promise<{ hash: string; ledger: number }> {
  if (!signers.length) {
    throw new StellarMultisigError('INVALID_SIGNERS', 'At least one signer must be provided.');
  }

  for (const s of signers) {
    if (!StrKey.isValidEd25519PublicKey(s.publicKey)) {
      throw new StellarMultisigError('INVALID_SIGNER_KEY', `Invalid Ed25519 public key: ${s.publicKey}`);
    }
    if (!Number.isInteger(s.weight) || s.weight < 1 || s.weight > 255) {
      throw new StellarMultisigError('INVALID_SIGNER_WEIGHT', `Signer weight must be an integer between 1 and 255.`);
    }
  }

  const networkPassphrase = options.networkPassphrase ?? Networks.TESTNET;

  try {
    const account = await options.server.loadAccount(accountKeypair.publicKey());
    const builder = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase });

    for (const signer of signers) {
      builder.addOperation(
        Operation.setOptions({
          signer: { ed25519PublicKey: signer.publicKey, weight: signer.weight },
        }),
      );
    }

    if (options.thresholds || options.masterWeight !== undefined) {
      builder.addOperation(
        Operation.setOptions({
          masterWeight: options.masterWeight,
          lowThreshold: options.thresholds?.low,
          medThreshold: options.thresholds?.med,
          highThreshold: options.thresholds?.high,
        }),
      );
    }

    const tx = builder.setTimeout(60).build();
    tx.sign(accountKeypair);

    const submitted = await options.server.submitTransaction(tx);
    return { hash: submitted.hash, ledger: submitted.ledger };
  } catch (err) {
    if (err instanceof StellarMultisigError) throw err;
    throw mapHorizonMultisigError(err);
  }
}