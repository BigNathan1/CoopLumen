import {
  Horizon,
  Keypair,
  Networks,
  TransactionBuilder,
  Operation,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { logger } from '../utils/logger';
import { MemoInput, buildMemo } from './memo';
import { TimeBoundsInput, applyTimeBounds } from './timeBounds';
import { invalidateBalanceCache } from '../cache/balances';
import { withSequenceRetry } from './sequenceCache';

type StellarNetwork = 'testnet' | 'mainnet';

/**
 * Error thrown when a Stellar account does not exist on the network.
 * This typically indicates the account has not been funded yet.
 */
export class UnfundedAccountError extends Error {
  constructor(publicKey: string) {
    super(`Account ${publicKey} does not exist on the network. The account may not be funded yet.`);
    this.name = 'UnfundedAccountError';
  }
}

/**
 * Error thrown when there is a network or Horizon connectivity issue.
 */
export class StellarNetworkError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'StellarNetworkError';
  }
}

/**
 * Error thrown when the provided public key is invalid.
 */
export class InvalidPublicKeyError extends Error {
  constructor(publicKey: string) {
    super(`Invalid Stellar public key format: ${publicKey}`);
    this.name = 'InvalidPublicKeyError';
  }
}

const HORIZON_URLS: Record<StellarNetwork, string> = {
  testnet: 'https://horizon-testnet.stellar.org',
  mainnet: 'https://horizon.stellar.org',
};

const NETWORK_PASSPHRASES: Record<StellarNetwork, string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
};

export const HORIZON_RETRY_CONFIG = {
  maxAttempts: 4,
  baseDelayMs: 100,
  maxDelayMs: 5000,
} as const;

const RETRYABLE_HORIZON_STATUS_CODES = new Set([429, 503]);

interface HorizonErrorShape {
  response?: {
    status?: number;
    headers?: RetryHeaders;
    data?: {
      detail?: string;
    };
  };
  message?: string;
}

type RetryHeaders = Record<string, unknown> | { get(name: string): string | null | undefined };

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function parseRetryAfterMs(retryAfter: string | null | undefined): number | null {
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const targetTime = Date.parse(retryAfter);
  if (!Number.isNaN(targetTime)) {
    return Math.max(0, targetTime - Date.now());
  }

  return null;
}

function readRetryAfterHeader(headers: RetryHeaders | undefined): string | null {
  if (!headers) return null;

  if (
    typeof (headers as { get?: (name: string) => string | null | undefined }).get === 'function'
  ) {
    return (
      (headers as { get: (name: string) => string | null | undefined }).get('retry-after') ?? null
    );
  }

  const headerValue = (headers as Record<string, unknown>)['retry-after'];
  return typeof headerValue === 'string' ? headerValue : null;
}

export interface CreateAccountParams {
  funderSecret: string;
  destinationPublicKey: string;
  startingBalance: string;
  memo?: MemoInput;
  timeBounds?: TimeBoundsInput;
}

class StellarServiceClass {
  private server: Horizon.Server;
  private network: string;

  constructor() {
    const env = (process.env.STELLAR_NETWORK ?? 'testnet') as StellarNetwork;
    const horizonUrl = process.env.STELLAR_HORIZON_URL ?? HORIZON_URLS[env];

    this.network = NETWORK_PASSPHRASES[env];
    this.server = new Horizon.Server(horizonUrl);
  }

  getServer(): Horizon.Server {
    return this.server;
  }

  /** Returns the network passphrase Horizon requests are signed against for the current environment. */
  getNetworkPassphrase(): string {
    return this.network;
  }

  getNetwork(): string {
    return this.getNetworkPassphrase();
  }

  isTestnet(): boolean {
    return this.network === (Networks.TESTNET as string);
  }

  isMainnet(): boolean {
    return this.network === (Networks.PUBLIC as string);
  }

  async call<T>(operationName: string, request: () => Promise<T>): Promise<T> {
    return this.withRetry(operationName, request);
  }

  async loadAccount(publicKey: string): Promise<Horizon.AccountResponse> {
    return this.withRetry('loadAccount', () => this.server.loadAccount(publicKey));
  }

  /**
   * Loads an account from Horizon with comprehensive error handling.
   * Returns the account on success, or throws a domain-specific error:
   * - UnfundedAccountError: Account does not exist on the network
   * - InvalidPublicKeyError: Public key is malformed
   * - StellarNetworkError: Network/Horizon connectivity issue
   *
   * @param publicKey The Stellar public key to load
   * @returns The Horizon AccountResponse with all account data
   * @throws UnfundedAccountError | InvalidPublicKeyError | StellarNetworkError
   */
  async loadAccountSafe(publicKey: string): Promise<Horizon.AccountResponse> {
    try {
      return await this.loadAccount(publicKey);
    } catch (error) {
      return this.handleLoadAccountError(error, publicKey);
    }
  }

  private handleLoadAccountError(error: unknown, publicKey: string): never {
    const horizonError = error as HorizonErrorShape;
    const status = horizonError.response?.status;
    const detail = horizonError.response?.data?.detail;
    const errorMessage = (horizonError as Error).message ?? '';

    // 404: Account not found on network (unfunded)
    if (status === 404) {
      throw new UnfundedAccountError(publicKey);
    }

    // Invalid public key format (typically manifests as 400 with specific message pattern)
    if (status === 400 && errorMessage.includes('public key')) {
      throw new InvalidPublicKeyError(publicKey);
    }

    // Network errors (503, 429 exhaustion after retries, connection failures, etc.)
    if (status && (status >= 500 || status === 429)) {
      const msg = detail ? `Stellar network error: ${detail}` : 'Stellar network unavailable';
      throw new StellarNetworkError(msg, status);
    }

    // Catch-all for other Horizon errors
    if (status) {
      throw new StellarNetworkError(
        `Stellar network error (${status}): ${detail ?? errorMessage}`,
        status
      );
    }

    // Network connectivity errors (no status code available)
    throw new StellarNetworkError(errorMessage || 'Failed to load account from Stellar network');
  }

  async getAccount(publicKey: string): Promise<Horizon.AccountResponse> {
    return this.loadAccount(publicKey);
  }

  async submitTransaction(
    transaction: Parameters<Horizon.Server['submitTransaction']>[0]
  ): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    return this.withRetry('submitTransaction', () => this.server.submitTransaction(transaction));
  }

  async getAccountBalance(publicKey: string): Promise<Horizon.HorizonApi.BalanceLine[]> {
    const account = await this.loadAccount(publicKey);
    return account.balances;
  }

  async getTransactionHistory(
    publicKey: string,
    limit = 20
  ): Promise<Horizon.ServerApi.TransactionRecord[]> {
    const records = await this.call('transactions.forAccount', () =>
      this.server.transactions().forAccount(publicKey).limit(limit).order('desc').call()
    );
    return records.records;
  }

  async getFeeStats(): Promise<Horizon.HorizonApi.FeeStatsResponse> {
    return this.call('feeStats', () => this.server.feeStats());
  }

  async createAccount(params: CreateAccountParams): Promise<string> {
    const { funderSecret, destinationPublicKey, startingBalance, memo, timeBounds } = params;
    const funderKeypair = Keypair.fromSecret(funderSecret);
    const network = this.getNetwork();

    const result = await withSequenceRetry(funderKeypair.publicKey(), async (funderAccount) => {
      const txBuilder = new TransactionBuilder(funderAccount, {
        fee: BASE_FEE,
        networkPassphrase: network,
      });

      const builtMemo = buildMemo(memo);
      if (builtMemo) {
        txBuilder.addMemo(builtMemo);
      }

      txBuilder.addOperation(
        Operation.createAccount({
          destination: destinationPublicKey,
          startingBalance,
        })
      );

      const tx = applyTimeBounds(txBuilder, timeBounds).build();
      tx.sign(funderKeypair);

      return this.submitTransaction(tx);
    });

    await invalidateBalanceCache([funderKeypair.publicKey(), destinationPublicKey]);
    return result.hash;
  }

  async ping(): Promise<boolean> {
    try {
      const network = (process.env.STELLAR_NETWORK ?? 'testnet') as StellarNetwork;
      const horizonUrl = process.env.STELLAR_HORIZON_URL ?? HORIZON_URLS[network];
      const response = await fetch(horizonUrl, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async withRetry<T>(operationName: string, request: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= HORIZON_RETRY_CONFIG.maxAttempts; attempt += 1) {
      try {
        return await request();
      } catch (error) {
        const horizonError = error as HorizonErrorShape;
        const status = horizonError.response?.status;

        if (!status || !RETRYABLE_HORIZON_STATUS_CODES.has(status)) {
          throw error;
        }

        if (attempt === HORIZON_RETRY_CONFIG.maxAttempts) {
          logger.warn(
            `Stellar Horizon operation ${operationName} failed with status ${status} after max attempts (${HORIZON_RETRY_CONFIG.maxAttempts}); giving up.`,
            { operationName, status, attempts: attempt }
          );
          throw error;
        }

        const retryAfterHeader = readRetryAfterHeader(horizonError.response?.headers);
        const retryAfterMs = parseRetryAfterMs(retryAfterHeader);

        let delayMs: number;
        if (retryAfterMs !== null) {
          delayMs = retryAfterMs;
        } else {
          const exponentialBase = HORIZON_RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1);
          // Add full jitter: random value between 0 and exponentialBase
          const jittered = Math.random() * exponentialBase;
          delayMs = Math.min(HORIZON_RETRY_CONFIG.maxDelayMs, jittered);
        }

        logger.info(
          `Stellar Horizon operation ${operationName} returned status ${status}; retrying in ${Math.round(delayMs)}ms (attempt ${attempt}/${HORIZON_RETRY_CONFIG.maxAttempts}).`,
          { operationName, status, attempt, delayMs }
        );

        await sleep(delayMs);
      }
    }

    throw new Error(`Stellar operation ${operationName} exhausted all retry attempts.`);
  }
}

export const StellarService = new StellarServiceClass();
