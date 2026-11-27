import {
  Account,
  Horizon,
  Keypair,
  Networks,
  TransactionBuilder,
  Operation,
  BASE_FEE,
  SorobanRpc,
  Contract,
  Transaction,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { logger } from '../utils/logger';
import { MemoInput, buildMemo } from './memo';
import { TimeBoundsInput, applyTimeBounds } from './timeBounds';
import { invalidateBalanceCache } from '../cache/balances';
import { withSequenceRetry } from './sequenceCache';
import { toStellarError } from './errors';

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

const SOROBAN_RPC_URLS: Record<StellarNetwork, string> = {
  testnet: 'https://soroban-testnet.stellar.org',
  mainnet: 'https://soroban-mainnet.stellar.org',
};

/**
 * A proposal as stored in the on-chain governance contract.
 * Vote tallies are token-weighted amounts (as strings to avoid precision loss).
 */
export interface OnChainProposal {
  id: string;
  communityId: string;
  title: string;
  description: string;
  proposer: string;
  status: string;
  createdAt: number;
  votingEndsAt: number;
  votesFor: string;
  votesAgainst: string;
  votesAbstain: string;
}

export interface SubmitVoteResult {
  hash: string;
  status: string;
}

export interface SubmitVoteParams {
  /** Base64-encoded, already-signed Soroban transaction envelope XDR. */
  signedXdr: string;
}

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
  private sorobanServer: SorobanRpc.Server;
  private networkPassphrase: string;

  constructor() {
    const env = (process.env.STELLAR_NETWORK ?? 'testnet') as StellarNetwork;
    const horizonUrl = process.env.STELLAR_HORIZON_URL ?? HORIZON_URLS[env];
    const sorobanUrl = process.env.SOROBAN_RPC_URL ?? SOROBAN_RPC_URLS[env];

    this.network = NETWORK_PASSPHRASES[env];
    this.networkPassphrase = NETWORK_PASSPHRASES[env];
    // Plain http is only ever a local stand-in, such as the E2E stack's fake Horizon.
    this.server = new Horizon.Server(horizonUrl, {
      allowHttp: horizonUrl.startsWith('http://'),
    });
    this.sorobanServer = new SorobanRpc.Server(sorobanUrl, {
      allowHttp: sorobanUrl.startsWith('http://'),
    });
  }

  getSorobanServer(): SorobanRpc.Server {
    return this.sorobanServer;
  }

  /** Returns the configured governance contract id, or throws if it is not set. */
  private getGovernanceContractId(): string {
    const contractId = process.env.GOVERNANCE_CONTRACT_ID;
    if (!contractId) {
      throw new StellarNetworkError('GOVERNANCE_CONTRACT_ID is not configured');
    }
    return contractId;
  }

  /**
   * Simulates a read-only invocation of the governance contract and returns the
   * decoded native result. Throws StellarNetworkError on simulation failure.
   */
  private async simulateContractRead(method: string, args: xdr.ScVal[]): Promise<unknown> {
    const contract = new Contract(this.getGovernanceContractId());
    const operation = contract.call(method, ...args);

    // Simulation requires a source account; use a well-known funded account
    // since read-only invocations are not signed or submitted.
    const sourceAccount = new Account(
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      '0'
    );

    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    let simulation: SorobanRpc.Api.SimulateTransactionResponse;
    try {
      simulation = await this.sorobanServer.simulateTransaction(tx);
    } catch (error) {
      logger.warn(`Soroban simulation for ${method} failed`, { method, error });
      throw new StellarNetworkError(
        `Failed to simulate governance contract call ${method}: ${(error as Error).message}`
      );
    }

    if (SorobanRpc.Api.isSimulationError(simulation)) {
      logger.warn(`Soroban simulation for ${method} returned an error`, {
        method,
        error: simulation.error,
      });
      throw new StellarNetworkError(
        `Governance contract call ${method} failed: ${simulation.error}`
      );
    }

    if (!('result' in simulation) || !simulation.result) {
      return null;
    }

    return scValToNative(simulation.result.retval);
  }

  private decodeProposal(raw: unknown): OnChainProposal {
    const record = (raw ?? {}) as Record<string, unknown>;
    const pick = (...keys: string[]): unknown => {
      for (const key of keys) {
        if (record[key] !== undefined && record[key] !== null) return record[key];
      }
      return undefined;
    };

    const asString = (value: unknown): string => {
      if (value === undefined || value === null) return '0';
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return String(value);
      }
      return JSON.stringify(value);
    };

    const asNumber = (value: unknown): number => {
      if (value === undefined || value === null) return 0;
      const num = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(num) ? num : 0;
    };

    return {
      id: asString(pick('id', 'proposal_id', 'proposalId')),
      communityId: asString(pick('community_id', 'communityId')),
      title: asString(pick('title')),
      description: asString(pick('description')),
      proposer: asString(pick('proposer', 'creator')),
      status: asString(pick('status', 'state')),
      createdAt: asNumber(pick('created_at', 'createdAt')),
      votingEndsAt: asNumber(pick('voting_ends_at', 'votingEndsAt', 'ends_at', 'endsAt')),
      votesFor: asString(pick('votes_for', 'votesFor')),
      votesAgainst: asString(pick('votes_against', 'votesAgainst')),
      votesAbstain: asString(pick('votes_abstain', 'votesAbstain')),
    };
  }

  /**
   * Reads all proposals for a community from the governance contract.
   */
  async getProposalsForCommunity(communityId: string): Promise<OnChainProposal[]> {
    const result = await this.simulateContractRead('get_proposals', [
      nativeToScVal(communityId, { type: 'string' }),
    ]);

    if (!Array.isArray(result)) {
      return [];
    }

    return result.map((entry) => this.decodeProposal(entry));
  }

  /**
   * Reads a single proposal (with vote tally) by id from the governance contract.
   * Returns null when the contract reports no such proposal.
   */
  async getProposalById(proposalId: string): Promise<OnChainProposal | null> {
    const result = await this.simulateContractRead('get_proposal', [
      nativeToScVal(proposalId, { type: 'string' }),
    ]);

    if (result === null || result === undefined) {
      return null;
    }

    return this.decodeProposal(result);
  }

  /**
   * Submits an already-signed Soroban vote transaction envelope to Soroban RPC.
   * Returns the transaction hash and the RPC-reported status.
   */
  async submitVoteTransaction(params: SubmitVoteParams): Promise<SubmitVoteResult> {
    const { signedXdr } = params;

    let transaction: Transaction;
    try {
      transaction = new Transaction(signedXdr, this.networkPassphrase);
    } catch (error) {
      throw new StellarNetworkError(
        `Invalid signed transaction envelope: ${(error as Error).message}`
      );
    }

    try {
      const response = await this.sorobanServer.sendTransaction(transaction);

      if (response.status === 'ERROR') {
        logger.warn('Soroban sendTransaction returned ERROR', {
          hash: response.hash,
          errorResult: response.errorResult?.toXDR('base64'),
        });
        throw new StellarNetworkError(
          `Soroban rejected vote transaction: ${response.errorResult?.toXDR('base64') ?? 'unknown error'}`
        );
      }

      return { hash: response.hash, status: response.status };
    } catch (error) {
      if (error instanceof StellarNetworkError) {
        throw error;
      }
      logger.warn('Soroban sendTransaction failed', { error });
      throw new StellarNetworkError(
        `Failed to submit vote transaction: ${(error as Error).message}`
      );
    }
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
   * Loads an account from Horizon, translating its failures into domain errors.
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

  async getTransaction(hash: string): Promise<Horizon.ServerApi.TransactionRecord> {
    return this.call('transactions.detail', () =>
      this.server.transactions().transaction(hash).call()
    );
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

  streamPayments(
    publicKey: string,
    onMessage: (message: Horizon.ServerApi.PaymentOperationRecord) => void,
    onError: (error: Error) => void,
    cursor: string = 'now'
  ): () => void {
    const cancel = this.server
      .payments()
      .forAccount(publicKey)
      .cursor(cursor)
      .stream({
        onmessage: (msg: unknown) => {
          onMessage(msg as Horizon.ServerApi.PaymentOperationRecord);
        },
        onerror: (err: unknown) => {
          onError(toStellarError(err, 'streamPayments'));
        },
      });

    return cancel;
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

/** Parameters for executing a passed governance proposal on chain. */
export interface ExecuteProposalParams {
  proposalId: string;
  communityId: string;
  proposerAddress: string;
}

/** Reads every governance proposal for a community from the contract. */
export async function fetchProposalsForCommunity(communityId: string): Promise<OnChainProposal[]> {
  return StellarService.getProposalsForCommunity(communityId);
}

/** Reads a single governance proposal, including its on-chain vote tally. */
export async function fetchProposalTally(proposalId: string): Promise<OnChainProposal | null> {
  return StellarService.getProposalById(proposalId);
}

/** Submits an already-signed Soroban vote transaction envelope. */
export async function submitVoteTransaction(params: SubmitVoteParams): Promise<SubmitVoteResult> {
  return StellarService.submitVoteTransaction(params);
}

/**
 * Invokes the governance contract's `execute` method for a proposal whose
 * voting period has ended.
 *
 * The transaction is simulated, assembled and signed by the funded account in
 * GOVERNANCE_SIGNER_SECRET; the resulting hash is what the route records.
 */
export async function executeProposalOnChain(
  params: ExecuteProposalParams
): Promise<{ txHash: string }> {
  const contractId = process.env.GOVERNANCE_CONTRACT_ID;
  if (!contractId) {
    throw new StellarNetworkError('GOVERNANCE_CONTRACT_ID is not configured');
  }

  const signerSecret = process.env.GOVERNANCE_SIGNER_SECRET;
  if (!signerSecret) {
    throw new StellarNetworkError('GOVERNANCE_SIGNER_SECRET is not configured');
  }

  const signer = Keypair.fromSecret(signerSecret);
  const account = await StellarService.loadAccount(signer.publicKey());
  const contract = new Contract(contractId);
  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: StellarService.getNetworkPassphrase(),
  })
    .addOperation(contract.call('execute', nativeToScVal(params.proposalId, { type: 'string' })))
    .setTimeout(30)
    .build();

  const server = StellarService.getSorobanServer();
  const simulation = await server.simulateTransaction(transaction);
  if (SorobanRpc.Api.isSimulationError(simulation)) {
    throw new StellarNetworkError(`Proposal execution simulation failed: ${simulation.error}`);
  }

  const prepared = SorobanRpc.assembleTransaction(transaction, simulation).build();
  prepared.sign(signer);
  const response = await server.sendTransaction(prepared);

  if (response.status === 'ERROR') {
    throw new StellarNetworkError(
      `Soroban rejected proposal execution: ${response.errorResult?.toXDR('base64') ?? 'unknown error'}`
    );
  }

  return { txHash: response.hash };
}
