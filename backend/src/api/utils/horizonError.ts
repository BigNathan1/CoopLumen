interface HorizonErrorShape {
  response?: {
    status?: number;
    data?: {
      extras?: { result_codes?: { transaction?: string; operations?: string[] } };
      title?: string;
      detail?: string;
    };
  };
}

export interface MappedError {
  status: number;
  message: string;
  code?: string;
  requiredXlm?: string;
  currentBalance?: string;
}

export interface InsufficientBalanceDetails {
  requiredXlm?: string;
  currentBalance?: string;
}

const OPERATION_MESSAGES: Record<string, string> = {
  op_underfunded: 'Insufficient balance to complete this operation.',
  op_no_trust: 'Destination account does not have a trustline for this asset.',
  op_line_full: "Destination account's trustline limit would be exceeded.",
  op_no_destination: 'Destination account does not exist.',
  op_src_no_trust: 'Source account does not have a trustline for this asset.',
  op_not_authorized: 'Account is not authorized to hold or transfer this asset.',
};

const TRANSACTION_MESSAGES: Record<string, string> = {
  tx_bad_seq: 'Transaction sequence number is stale; please retry.',
  tx_insufficient_balance: 'Account balance is insufficient to cover the transaction and fees.',
  tx_insufficient_fee: 'Submitted fee is below the network minimum.',
};

/** Maps a Horizon/Stellar SDK submission error to a clear, actionable message. */
export function mapHorizonError(
  err: unknown,
  details?: InsufficientBalanceDetails
): MappedError {
  const horizonErr = err as HorizonErrorShape;
  const resultCodes = horizonErr?.response?.data?.extras?.result_codes;

  if (resultCodes?.operations?.length) {
    const opCode = resultCodes.operations[0];
    if (OPERATION_MESSAGES[opCode]) {
      return { status: 422, message: OPERATION_MESSAGES[opCode] };
    }
  }

  if (resultCodes?.transaction && TRANSACTION_MESSAGES[resultCodes.transaction]) {
    if (resultCodes.transaction === 'tx_insufficient_balance') {
      return {
        status: 402,
        code: 'INSUFFICIENT_BALANCE',
        message: TRANSACTION_MESSAGES[resultCodes.transaction],
        requiredXlm: details?.requiredXlm,
        currentBalance: details?.currentBalance,
      };
    }

    return { status: 422, message: TRANSACTION_MESSAGES[resultCodes.transaction] };
  }

  if (horizonErr?.response?.status === 404) {
    return { status: 404, message: 'Stellar account or asset not found.' };
  }

  const detail = horizonErr?.response?.data?.detail ?? horizonErr?.response?.data?.title;
  if (detail) {
    return { status: 502, message: `Stellar network error: ${detail}` };
  }

  return { status: 502, message: 'Stellar network error. Please try again later.' };
}
