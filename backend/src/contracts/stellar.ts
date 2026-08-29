import { Horizon, Networks } from '@stellar/stellar-sdk';
import { logger } from '../utils/logger';

type StellarNetwork = 'testnet' | 'mainnet';

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
} as const;

const RETRYABLE_HORIZON_STATUS_CODES = new Set([429, 503]);

interface HorizonErrorShape {
  response?: {
    status?: number;
    headers?: RetryHeaders;
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

  getNetwork(): string {
    return this.network;
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
          logger.error('Horizon request failed after retries', {
            operationName,
            attempt,
            status,
            error: horizonError.message,
          });
          throw error;
        }

        const retryAfterMs = parseRetryAfterMs(
          readRetryAfterHeader(horizonError.response?.headers)
        );
        const delayMs = retryAfterMs ?? HORIZON_RETRY_CONFIG.baseDelayMs * 2 ** (attempt - 1);

        logger.warn('Retrying Horizon request', {
          operationName,
          attempt,
          status,
          delayMs,
        });

        await sleep(delayMs);
      }
    }

    throw new Error(`Unreachable retry state for ${operationName}`);
  }
}

export const StellarService = new StellarServiceClass();
