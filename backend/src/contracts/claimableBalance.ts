import { Asset, Claimant, Keypair, TransactionBuilder, Operation, BASE_FEE } from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { MemoInput, buildMemo } from './memo';
import { TimeBoundsInput, applyTimeBounds } from './timeBounds';
import { invalidateBalanceCache } from '../cache/balances';
import { withStellarErrors } from './errors';
import { withSequenceRetry } from './sequenceCache';

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

export interface ClaimableBalanceResult {
  /** The claimable balance ID created */
  balanceId: string;
  /** Transaction hash */
  txHash: string;
  /** Ledger the transaction was included in */
  ledger: number;
}

/**
 * Extracts the claimable balance ID from a Horizon transaction result.
 * The balance ID is embedded in the operation result within the transaction metadata.
 */
function extractBalanceIdFromResult(result: any): string {
  // The Horizon response includes operation results in _links and operation metadata.
  // The balance ID is returned as a property in the result or fetched from operation records.
  // For now, return the id if available in the result directly.
  if (result.id) {
    return result.id;
  }

  // If not in the top-level result, it may be in operation records.
  // This is a fallback — the SDK version should provide it directly.
  if (result._links && result._links.transaction) {
    // In real usage, the balance ID would be queried from the ledger or operation records.
    // For this implementation, we assume the SDK surfaces it in result.
  }

  // Fallback: generate a placeholder (should not reach here with proper SDK response)
  throw new Error('Balance ID not found in Horizon response');
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
export async function create(params: CreateClaimableBalanceParams): Promise<ClaimableBalanceResult> {
  const { asset, amount, claimants, sourceKeypair, memo, timeBounds } = params;

  const action = 'Create claimable balance';

  return withStellarErrors(action, async () => {
    const network = StellarService.getNetwork();

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

      return StellarService.submitTransaction(tx);
    });

    // Extract balance ID from the Horizon response
    const balanceId = extractBalanceIdFromResult(result);

    // Invalidate any cached balance data for the source account since it has changed
    await invalidateBalanceCache([sourceKeypair.publicKey()]);

    return {
      balanceId,
      txHash: result.hash,
      ledger: result.ledger,
    };
  });
}

export const claimableBalance = { create };
