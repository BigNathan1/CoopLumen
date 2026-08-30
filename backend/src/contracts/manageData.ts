import { Keypair, TransactionBuilder, Operation, BASE_FEE } from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { MemoInput, buildMemo } from './memo';
import { TimeBoundsInput, applyTimeBounds } from './timeBounds';
import { withSequenceRetry } from './sequenceCache';
import { StellarError } from './errors';

export interface ManageDatumParams {
  accountSecret: string;
  key: string;
  value?: string | Buffer | null;
  memo?: MemoInput;
  timeBounds?: TimeBoundsInput;
}

/**
 * Adds, updates, or deletes a data entry (key-value pair) on a Stellar account
 * using the ManageData operation.
 *
 * - `key`: Up to 64 bytes string.
 * - `value`: A string, Buffer, or null/undefined to delete the data entry.
 */
export async function manageDatum(params: ManageDatumParams): Promise<string> {
  const { accountSecret, key, value, memo, timeBounds } = params;

  if (!key || key.trim() === '') {
    throw new StellarError('ManageData failed: key cannot be empty', { status: 400 });
  }

  if (Buffer.byteLength(key, 'utf8') > 64) {
    throw new StellarError('ManageData failed: key cannot exceed 64 bytes', { status: 400 });
  }

  let parsedValue: Buffer | null | undefined = undefined;
  if (value === null || value === undefined) {
    parsedValue = null;
  } else if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > 64) {
      throw new StellarError('ManageData failed: value cannot exceed 64 bytes', { status: 400 });
    }
    parsedValue = Buffer.from(value, 'utf8');
  } else if (Buffer.isBuffer(value)) {
    if (value.length > 64) {
      throw new StellarError('ManageData failed: value cannot exceed 64 bytes', { status: 400 });
    }
    parsedValue = value;
  }

  const accountKeypair = Keypair.fromSecret(accountSecret);
  const network = StellarService.getNetwork();

  const result = await withSequenceRetry(accountKeypair.publicKey(), async (account) => {
    const txBuilder = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: network,
    }).addOperation(
      Operation.manageData({
        name: key,
        value: parsedValue ?? null,
      })
    );

    const builtMemo = buildMemo(memo);
    if (builtMemo) {
      txBuilder.addMemo(builtMemo);
    }

    const tx = applyTimeBounds(txBuilder, timeBounds).build();
    tx.sign(accountKeypair);
    return StellarService.submitTransaction(tx);
  });

  return result.hash;
}
