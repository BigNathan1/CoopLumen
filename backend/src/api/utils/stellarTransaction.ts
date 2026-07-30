interface AccountLike {
  publicKey?: () => string;
  accountId?: () => string;
}

interface TransactionLike {
  fee?: number | string;
  source?: string | AccountLike;
  operations: Array<{
    type?: string;
    amount?: string;
    asset?: unknown;
    destination?: string;
    source?: unknown;
  }>;
}

const STROOPS_PER_XLM = 10_000_000;

function formatXlm(amount: number): string {
  return amount.toFixed(7);
}

function extractAccountId(value: string | AccountLike | undefined): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value.accountId === 'function') return value.accountId();
  if (typeof value.publicKey === 'function') return value.publicKey();
  return undefined;
}

function isNativeAsset(operation: TransactionLike['operations'][number]): boolean {
  if (!operation.asset) return false;

  if (typeof operation.asset === 'object' && operation.asset !== null) {
    const asset = operation.asset as {
      isNative?: () => boolean;
      getCode?: () => string;
      code?: string;
    };

    if (typeof asset.isNative === 'function') {
      return asset.isNative();
    }

    return asset.code === 'XLM' || asset.getCode?.() === 'XLM';
  }

  return false;
}

export function getNativeBalance(account: {
  balances: Array<{ asset_type: string; balance: string }>;
}): string | undefined {
  return account.balances.find((balance) => balance.asset_type === 'native')?.balance;
}

export function getTransactionSource(transaction: TransactionLike): string | undefined {
  const operationSource = extractAccountId(
    transaction.operations[0]?.source as string | AccountLike | undefined
  );
  return operationSource ?? extractAccountId(transaction.source);
}

export function getTransactionDestination(transaction: TransactionLike): string | undefined {
  return transaction.operations[0]?.destination;
}

export function getRequiredXlmForTransaction(transaction: TransactionLike): string {
  const feeInXlm = Number(transaction.fee ?? 0) / STROOPS_PER_XLM;
  const nativePaymentTotal = transaction.operations.reduce((total, operation) => {
    if (operation.type !== 'payment' || !isNativeAsset(operation)) {
      return total;
    }

    return total + Number(operation.amount ?? 0);
  }, 0);

  return formatXlm(feeInXlm + nativePaymentTotal);
}

export function getRequiredXlmForFee(feeInStroops: number | string): string {
  return formatXlm(Number(feeInStroops) / STROOPS_PER_XLM);
}
