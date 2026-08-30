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

/**
 * Operation-level result codes shared across Stellar's payment, trustline,
 * account-creation, and authorization operations.
 * https://developers.stellar.org/docs/data/horizon/api-reference/errors/result-codes/operation-specific
 */
const OPERATION_MESSAGES: Record<string, string> = {
  // Common to most operation types
  op_bad_auth: 'Transaction is missing a required signature for this operation.',
  op_no_account: 'The source account for this operation does not exist.',
  op_not_supported: 'This operation is not supported by the network.',
  op_too_many_subentries:
    'Account has reached the maximum number of subentries (trustlines, offers, signers).',
  op_exceeded_work_limit:
    'Operation was rejected because it exceeded the allowed processing limit.',
  op_too_many_sponsoring: 'Account is sponsoring too many reserves to complete this operation.',
  op_malformed: 'Operation parameters are malformed.',

  // Payment / path payment
  op_underfunded: 'Insufficient balance to complete this operation.',
  op_no_trust: 'Destination account does not have a trustline for this asset.',
  op_line_full: "Destination account's trustline limit would be exceeded.",
  op_no_destination: 'Destination account does not exist.',
  op_no_issuer: 'The asset issuer account does not exist.',
  op_src_no_trust: 'Source account does not have a trustline for this asset.',
  op_src_not_authorized: 'Source account is not authorized to transfer this asset.',
  op_not_authorized: 'Account is not authorized to hold or transfer this asset.',
  op_cross_self: 'The payment path crosses its own offer.',
  op_too_few_offers: 'No path could be found to complete this payment.',
  op_offer_cross_self: 'The payment path crosses its own offer.',

  // Change trust
  op_invalid_limit: 'Trustline limit must be greater than the current balance.',
  op_low_reserve:
    'Account does not hold enough XLM to cover the minimum reserve for this operation.',
  op_trust_not_required:
    'A trustline is not required for this asset (it is issued by this account).',
  op_cant_delete: 'Trustline cannot be removed while it still holds a balance or has open offers.',
  op_trust_line_missing: 'No trustline exists for this asset.',
  op_is_authorized: 'Trustline is already authorized.',
  op_deauthorize_not_allowed: 'The asset issuer does not allow trustline deauthorization.',

  // Create account
  op_already_exists: 'An account already exists at this address.',

  // Account merge / signers / set options
  op_immutable_set: 'Account settings are immutable and cannot be changed.',
  op_has_sub_entries:
    'Account cannot be merged while it still holds trustlines, offers, or data entries.',
  op_seqnum_too_far: "Account's sequence number is too far in the future to merge.",
  op_dest_full: 'Destination account has reached the maximum XLM balance it can hold.',
  op_too_many_signers: 'Account has reached the maximum number of signers.',
  op_bad_signer: 'The signer key or weight provided is invalid.',
  op_invalid_home_domain: 'The home domain value is invalid.',
  op_auth_revocable_required: "This operation requires the issuer's AUTH_REVOCABLE flag to be set.",

  // Manage offer / claimable balance
  op_sell_no_trust: 'Selling asset requires a trustline that does not exist.',
  op_buy_no_trust: 'Buying asset requires a trustline that does not exist.',
  op_sell_not_authorized: 'Account is not authorized to sell this asset.',
  op_buy_not_authorized: 'Account is not authorized to buy this asset.',
  op_offer_not_found: 'The referenced offer does not exist.',
  op_not_found: 'The referenced claimable balance does not exist.',
  op_cannot_claim: 'This account is not permitted to claim this balance.',
  op_claimant_count_exceeds_limit: 'Too many claimants specified for this claimable balance.',
};

/**
 * Transaction-level result codes.
 * https://developers.stellar.org/docs/data/horizon/api-reference/errors/result-codes/transactions
 */
const TRANSACTION_MESSAGES: Record<string, string> = {
  tx_failed: 'One or more operations in the transaction failed.',
  tx_too_early: 'Transaction submitted before its valid start time.',
  tx_too_late: 'Transaction submitted after its valid end time; please rebuild and resubmit.',
  tx_missing_operation: 'Transaction must contain at least one operation.',
  tx_bad_seq: 'Transaction sequence number is stale; please retry.',
  tx_bad_auth: 'Transaction is missing a valid signature for the source account.',
  tx_insufficient_balance: 'Account balance is insufficient to cover the transaction and fees.',
  tx_no_source_account: 'The source account for this transaction does not exist.',
  tx_insufficient_fee: 'Submitted fee is below the network minimum.',
  tx_bad_auth_extra: 'Transaction has unused or extraneous signatures.',
  tx_internal_error:
    'The Stellar network encountered an internal error processing this transaction.',
  tx_not_supported: 'This transaction type is not supported by the network.',
  tx_fee_bump_inner_failed: 'The inner transaction of this fee-bump transaction failed.',
  tx_bad_sponsorship: 'Reserve sponsorship in this transaction is malformed.',
  tx_bad_min_seq_age_or_gap: 'Transaction does not satisfy the minimum sequence age or ledger gap.',
  tx_malformed: 'Transaction envelope is malformed.',
};

/** Maps a Horizon/Stellar SDK submission error to a clear, actionable message. */
export function mapHorizonError(err: unknown, details?: InsufficientBalanceDetails): MappedError {
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
