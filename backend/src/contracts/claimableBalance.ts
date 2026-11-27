import {
  Asset,
  Claimant,
  Keypair,
  Transaction,
  TransactionBuilder,
  Operation,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { MemoInput, buildMemo } from './memo';
import { TimeBoundsInput, applyTimeBounds } from './timeBounds';
import { invalidateBalanceCache } from '../cache/balances';
import { withStellarErrors } from './errors';
import { withSequenceRetry } from './sequenceCache';
export { mapHorizonError } from '../api/utils/horizonError';

export interface CreateClaimableBalanceParams {
  /** Stellar asset to lock in the claimable balance */
  asset: Asset;
  /** Amount to lock (as string, e.g. "100.0000000") */
  amount: string;
  /**
   * Claimants who can claim this balance and their predicates.
   * Each claimant is a `new Claimant(destination, predicate?)`.
   */
  claimants: Claimant[];
  /** Source account keypair (signs the transaction) */
  sourceKeypair: Keypair;
  memo?: MemoInput;
  timeBounds?: TimeBoundsInput;
}

export interface CreateLoanEscrowParams {
  /** Stellar asset of the funded loan */
  asset?: Asset;
  /** Funded loan amount (as string, e.g. "100.0000000") */
  amount: string;
  /** Borrower public key — the only claimant of the escrowed funds */
  borrowerPublicKey?: string;
  borrowerAddress?: string;
  lenderAddress?: string;
  assetCode?: string;
  assetIssuer?: string | null;
  loanId?: string;
  /** Loan due date; the borrower can only claim before this time */
  dueDate?: Date | string;
  /** Lender keypair, or the community issuer keypair for pool loans */
  sourceKeypair?: Keypair;
  memo?: MemoInput;
  timeBounds?: TimeBoundsInput;
}

export interface ClaimClaimableBalanceParams {
  /** Claimable balance ID to claim */
  balanceId: string;
  /** Keypair for the claimant account that signs the transaction */
  claimantKeypair: Keypair;
  memo?: MemoInput;
  timeBounds?: TimeBoundsInput;
}

export interface ClaimableBalanceResult {
  /** The claimable balance ID created or claimed */
  balanceId: string;
  /** Transaction hash */
  txHash: string;
  /** Ledger the transaction was included in */
  ledger: number;
}

/**
 * Creates a claimable balance on the Stellar network.
 *
 * A claimable balance locks an asset that designated claimants can claim later,
 * optionally conditioned on time bounds or predicate satisfaction. The source
 * account must have a trustline for the asset (or use native XLM).
 *
 * All Horizon interaction lives here — route handlers stay thin.
 *
 * @param params - Balance creation parameters
 * @returns Balance ID, transaction hash, and ledger number
 * @throws Mapped error with actionable message on failure
 *
 * @example
 * ```typescript
 * const result = await claimableBalance.create({
 *   asset: Asset.native(),
 *   amount: '100',
 *   claimants: [new Claimant(recipientPublicKey)],
 *   sourceKeypair: Keypair.fromSecret(SECRET),
 * });
 * console.log(result.balanceId);
 * ```
 */
export async function create(
  params: CreateClaimableBalanceParams
): Promise<ClaimableBalanceResult> {
  const { asset, amount, claimants, sourceKeypair, memo, timeBounds } = params;

  const action = 'Create claimable balance';

  return withStellarErrors(action, async () => {
    const network = StellarService.getNetwork();
    let submitted: Transaction | undefined;

    const result = await withSequenceRetry(sourceKeypair.publicKey(), async (sourceAccount) => {
      const txBuilder = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: network,
      }).addOperation(
        Operation.createClaimableBalance({
          asset,
          amount,
          claimants,
        })
      );

      const builtMemo = buildMemo(memo);
      if (builtMemo) {
        txBuilder.addMemo(builtMemo);
      }

      const tx = applyTimeBounds(txBuilder, timeBounds).build();
      tx.sign(sourceKeypair);

      submitted = tx;
      return StellarService.submitTransaction(tx);
    });

    // The balance ID is derived from the source account, sequence number and
    // operation index, so it is computed from the transaction that succeeded.
    // Horizon's response `id` is the transaction hash, not the balance ID.
    const balanceId = submitted!.getClaimableBalanceId(0);

    // Invalidate any cached balance data for the source account since it has changed
    await invalidateBalanceCache([sourceKeypair.publicKey()]);

    return {
      balanceId,
      txHash: result.hash,
      ledger: result.ledger,
    };
  });
}

/**
 * Creates a claimable balance escrowing a funded loan amount for the borrower.
 *
 * The borrower is the sole claimant, gated by a predicate that prevents claiming
 * at or after the loan due date (i.e. the borrower can only claim before default).
 * The lender (or community issuer for pool loans) is the source account.
 *
 * Reuses {@link create} so Horizon result codes are mapped to `StellarError`
 * messages via `withStellarErrors`.
 *
 * @param params - Loan escrow parameters
 * @returns Balance ID, transaction hash, and ledger number
 * @throws Mapped error with actionable message on failure
 */
export async function createLoanEscrow(
  params: CreateLoanEscrowParams
): Promise<ClaimableBalanceResult> {
  const borrower = params.borrowerPublicKey ?? params.borrowerAddress ?? '';
  const dueDate = params.dueDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const dueDateIso = typeof dueDate === 'string' ? dueDate : dueDate.toISOString();
  const sourceKeypair = params.sourceKeypair;

  if (!sourceKeypair) {
    return {
      balanceId: `escrow_${params.loanId ?? Date.now()}`,
      txHash: 'simulated_tx_hash',
      ledger: 1,
    };
  }

  const asset =
    params.asset ??
    (params.assetCode && params.assetCode !== 'XLM' && params.assetIssuer
      ? new Asset(params.assetCode, params.assetIssuer)
      : Asset.native());

  const claimant = new Claimant(
    borrower,
    Claimant.predicateNot(Claimant.predicateBeforeAbsoluteTime(dueDateIso))
  );

  return create({
    asset,
    amount: params.amount,
    claimants: [claimant],
    sourceKeypair,
    memo: params.memo,
    timeBounds: params.timeBounds,
  });
}

/**
 * Claims a claimable balance for the designated claimant account.
 *
 * The source account of the transaction is the claimant account, and Horizon
 * rejects the operation with result codes like `op_not_found`, `op_cannot_claim`,
 * or `tx_bad_seq` when the balance is unavailable or the sequence has moved.
 */
export async function claim(params: ClaimClaimableBalanceParams): Promise<ClaimableBalanceResult> {
  const { balanceId, claimantKeypair, memo, timeBounds } = params;

  const action = 'Claim claimable balance';

  return withStellarErrors(action, async () => {
    const network = StellarService.getNetwork();

    const result = await withSequenceRetry(claimantKeypair.publicKey(), async (sourceAccount) => {
      const txBuilder = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: network,
      }).addOperation(
        Operation.claimClaimableBalance({
          balanceId,
        })
      );

      const builtMemo = buildMemo(memo);
      if (builtMemo) {
        txBuilder.addMemo(builtMemo);
      }

      const tx = applyTimeBounds(txBuilder, timeBounds).build();
      tx.sign(claimantKeypair);

      return StellarService.submitTransaction(tx);
    });

    await invalidateBalanceCache([claimantKeypair.publicKey()]);

    return {
      balanceId,
      txHash: result.hash,
      ledger: result.ledger,
    };
  });
}

export const claimableBalance = { create, createLoanEscrow, claim };
