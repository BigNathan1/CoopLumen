import { mapHorizonError } from '../horizonError';

function horizonError(opts: {
  status?: number;
  transaction?: string;
  operations?: string[];
  title?: string;
  detail?: string;
}): {
  response: {
    status?: number;
    data: {
      extras: { result_codes: { transaction?: string; operations?: string[] } };
      title?: string;
      detail?: string;
    };
  };
} {
  return {
    response: {
      status: opts.status,
      data: {
        extras: {
          result_codes: {
            transaction: opts.transaction,
            operations: opts.operations,
          },
        },
        title: opts.title,
        detail: opts.detail,
      },
    },
  };
}

describe('mapHorizonError', () => {
  describe('transaction-level result codes', () => {
    const cases: Array<[string, number]> = [
      ['tx_too_early', 422],
      ['tx_too_late', 422],
      ['tx_missing_operation', 422],
      ['tx_bad_seq', 422],
      ['tx_bad_auth', 422],
      ['tx_no_source_account', 422],
      ['tx_insufficient_fee', 422],
      ['tx_bad_auth_extra', 422],
      ['tx_internal_error', 422],
      ['tx_not_supported', 422],
      ['tx_fee_bump_inner_failed', 422],
      ['tx_bad_sponsorship', 422],
      ['tx_bad_min_seq_age_or_gap', 422],
      ['tx_malformed', 422],
    ];

    it.each(cases)('maps %s to status %d with a friendly message', (code, status) => {
      const mapped = mapHorizonError(horizonError({ transaction: code }));
      expect(mapped.status).toBe(status);
      expect(mapped.message).not.toBe('');
      expect(mapped.message).not.toMatch(/^tx_/);
    });

    it('maps tx_insufficient_balance to 402 with the INSUFFICIENT_BALANCE code and details', () => {
      const mapped = mapHorizonError(horizonError({ transaction: 'tx_insufficient_balance' }), {
        requiredXlm: '10.0000000',
        currentBalance: '2.0000000',
      });

      expect(mapped.status).toBe(402);
      expect(mapped.code).toBe('INSUFFICIENT_BALANCE');
      expect(mapped.requiredXlm).toBe('10.0000000');
      expect(mapped.currentBalance).toBe('2.0000000');
    });
  });

  describe('operation-level result codes', () => {
    const cases: string[] = [
      'op_bad_auth',
      'op_no_account',
      'op_not_supported',
      'op_too_many_subentries',
      'op_exceeded_work_limit',
      'op_too_many_sponsoring',
      'op_malformed',
      'op_underfunded',
      'op_no_trust',
      'op_line_full',
      'op_no_destination',
      'op_no_issuer',
      'op_src_no_trust',
      'op_src_not_authorized',
      'op_not_authorized',
      'op_cross_self',
      'op_too_few_offers',
      'op_offer_cross_self',
      'op_invalid_limit',
      'op_low_reserve',
      'op_trust_not_required',
      'op_cant_delete',
      'op_trust_line_missing',
      'op_is_authorized',
      'op_deauthorize_not_allowed',
      'op_already_exists',
      'op_immutable_set',
      'op_has_sub_entries',
      'op_seqnum_too_far',
      'op_dest_full',
      'op_too_many_signers',
      'op_bad_signer',
      'op_invalid_home_domain',
      'op_auth_revocable_required',
      'op_sell_no_trust',
      'op_buy_no_trust',
      'op_sell_not_authorized',
      'op_buy_not_authorized',
      'op_offer_not_found',
      'op_not_found',
      'op_cannot_claim',
      'op_claimant_count_exceeds_limit',
    ];

    it.each(cases)('maps %s to a 422 with a friendly message', (code) => {
      const mapped = mapHorizonError(horizonError({ operations: [code] }));
      expect(mapped.status).toBe(422);
      expect(mapped.message).not.toBe('');
      expect(mapped.message).not.toMatch(/^op_/);
    });

    it('prefers the operation code over the transaction code when both are present', () => {
      const mapped = mapHorizonError(
        horizonError({ transaction: 'tx_failed', operations: ['op_underfunded'] })
      );
      expect(mapped.message).toBe('Insufficient balance to complete this operation.');
    });
  });

  describe('fallbacks', () => {
    it('maps a 404 Horizon response to a 404 with a friendly message', () => {
      const mapped = mapHorizonError(horizonError({ status: 404 }));
      expect(mapped.status).toBe(404);
      expect(mapped.message).toBe('Stellar account or asset not found.');
    });

    it('falls back to a 502 including the Horizon detail when no result code matches', () => {
      const mapped = mapHorizonError(horizonError({ detail: 'Horizon is down for maintenance' }));
      expect(mapped.status).toBe(502);
      expect(mapped.message).toBe('Stellar network error: Horizon is down for maintenance');
    });

    it('falls back to the Horizon title when detail is absent', () => {
      const mapped = mapHorizonError(horizonError({ title: 'Bad Request' }));
      expect(mapped.status).toBe(502);
      expect(mapped.message).toBe('Stellar network error: Bad Request');
    });

    it('falls back to a generic message for a completely unrecognized error', () => {
      const mapped = mapHorizonError(new Error('network timeout'));
      expect(mapped.status).toBe(502);
      expect(mapped.message).toBe('Stellar network error. Please try again later.');
    });

    it('falls back to a generic message for an unknown result code', () => {
      const mapped = mapHorizonError(horizonError({ transaction: 'tx_some_future_code' }));
      expect(mapped.status).toBe(502);
      expect(mapped.message).toBe('Stellar network error. Please try again later.');
    });
  });
});
