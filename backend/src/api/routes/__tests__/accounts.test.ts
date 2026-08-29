import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';

jest.mock('../../../db', () => ({
  db: {
    ping: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

import app from '../../../app';
import { StellarService } from '../../../contracts/stellar';

const publicKey = Keypair.random().publicKey();

function setMockServer(server: unknown): void {
  (StellarService as unknown as { server: unknown }).server = server;
}

function runTimeoutsImmediately(): jest.SpyInstance {
  return jest.spyOn(global, 'setTimeout').mockImplementation(((
    callback: (...args: unknown[]) => void
  ) => {
    if (typeof callback === 'function') {
      callback();
    }

    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
}

const MOCK_TRUSTLINE = {
  balance: '10.0000000',
  limit: '922337203685.4775807',
  buying_liabilities: '0.0000000',
  selling_liabilities: '0.0000000',
  last_modified_ledger: 2638989,
  is_authorized: true,
  is_authorized_to_maintain_liabilities: true,
  asset_type: 'credit_alphanum4',
  asset_code: 'USDC',
  asset_issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
};

const MOCK_NATIVE = {
  asset_type: 'native',
  balance: '100.0000000',
  buying_liabilities: '0.0000000',
  selling_liabilities: '0.0000000',
};

describe('accounts routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('GET /api/v1/accounts/:publicKey', () => {
    it('returns a validation error for an invalid public key', async () => {
      const loadAccount = jest.fn();
      setMockServer({ loadAccount });

      const response = await request(app).get('/api/v1/accounts/not-a-stellar-key');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        data: null,
        error: 'Validation failed',
        meta: {
          errors: [
            {
              path: 'publicKey',
              message: 'publicKey must be a valid Stellar public key',
            },
          ],
        },
      });
      expect(loadAccount).not.toHaveBeenCalled();
    });

    it('returns full account details from Horizon for a valid public key', async () => {
      const mockAccount = {
        id: publicKey,
        account_id: publicKey,
        sequence: '1000001',
        sequence_ledger: 12345,
        sequence_time: '2026-08-27T12:00:00Z',
        subentry_count: 3,
        home_domain: 'cooplumen.org',
        inflation_destination: publicKey,
        last_modified_ledger: 12350,
        last_modified_time: '2026-08-27T12:05:00Z',
        thresholds: {
          low_threshold: 0,
          med_threshold: 1,
          high_threshold: 2,
        },
        flags: {
          auth_required: false,
          auth_revocable: false,
          auth_immutable: false,
          auth_clawback_enabled: false,
        },
        balances: [
          {
            asset_type: 'native',
            balance: '500.0000000',
            buying_liabilities: '0.0000000',
            selling_liabilities: '0.0000000',
          },
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'COOP',
            asset_issuer: publicKey,
            balance: '1000.0000000',
            limit: '922337203685.4775807',
            buying_liabilities: '0.0000000',
            selling_liabilities: '0.0000000',
            last_modified_ledger: 12300,
            is_authorized: true,
            is_authorized_to_maintain_liabilities: true,
          },
        ],
        signers: [
          {
            key: publicKey,
            weight: 1,
            type: 'ed25519_public_key',
          },
        ],
        data_attr: {
          community_role: 'YWRtaW4=',
        },
        num_sponsoring: 0,
        num_sponsored: 0,
        paging_token: publicKey,
      };

      const loadAccount = jest.fn().mockResolvedValue(mockAccount);
      setMockServer({ loadAccount });

      const response = await request(app).get(`/api/v1/accounts/${publicKey}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: {
          id: publicKey,
          account_id: publicKey,
          sequence: '1000001',
          sequence_ledger: 12345,
          sequence_time: '2026-08-27T12:00:00Z',
          subentry_count: 3,
          home_domain: 'cooplumen.org',
          inflation_destination: publicKey,
          last_modified_ledger: 12350,
          last_modified_time: '2026-08-27T12:05:00Z',
          thresholds: {
            low_threshold: 0,
            med_threshold: 1,
            high_threshold: 2,
          },
          flags: {
            auth_required: false,
            auth_revocable: false,
            auth_immutable: false,
            auth_clawback_enabled: false,
          },
          balances: [
            {
              asset_type: 'native',
              balance: '500.0000000',
              buying_liabilities: '0.0000000',
              selling_liabilities: '0.0000000',
            },
            {
              asset_type: 'credit_alphanum4',
              asset_code: 'COOP',
              asset_issuer: publicKey,
              balance: '1000.0000000',
              limit: '922337203685.4775807',
              buying_liabilities: '0.0000000',
              selling_liabilities: '0.0000000',
              last_modified_ledger: 12300,
              is_authorized: true,
              is_authorized_to_maintain_liabilities: true,
            },
          ],
          signers: [
            {
              key: publicKey,
              weight: 1,
              type: 'ed25519_public_key',
            },
          ],
          data: {
            community_role: 'YWRtaW4=',
          },
          num_sponsoring: 0,
          num_sponsored: 0,
          paging_token: publicKey,
        },
      });
      expect(loadAccount).toHaveBeenCalledWith(publicKey);
    });

    it('returns a 404 when the account is not found on Stellar network', async () => {
      const loadAccount = jest.fn().mockRejectedValue({ response: { status: 404 } });
      setMockServer({ loadAccount });

      const response = await request(app).get(`/api/v1/accounts/${publicKey}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        data: null,
        error: 'Stellar account or asset not found.',
      });
    });

    it('retries Horizon 429 rate-limiting failures and succeeds', async () => {
      const setTimeoutSpy = runTimeoutsImmediately();
      const mockAccount = {
        id: publicKey,
        account_id: publicKey,
        sequence: '500',
        subentry_count: 0,
        last_modified_ledger: 100,
        thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
        flags: { auth_required: false, auth_revocable: false, auth_immutable: false },
        balances: [{ asset_type: 'native', balance: '10.0000000' }],
        signers: [{ key: publicKey, weight: 1, type: 'ed25519_public_key' }],
        data_attr: {},
      };

      const loadAccount = jest
        .fn()
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockRejectedValueOnce({ response: { status: 429 } })
        .mockResolvedValueOnce(mockAccount);
      setMockServer({ loadAccount });

      const response = await request(app).get(`/api/v1/accounts/${publicKey}`);

      expect(response.status).toBe(200);
      expect(response.body.data.sequence).toBe('500');
      expect(loadAccount).toHaveBeenCalledTimes(3);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 100);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 200);
    });

    it('retries Horizon 503 service unavailable failures and succeeds', async () => {
      const setTimeoutSpy = runTimeoutsImmediately();
      const mockAccount = {
        id: publicKey,
        account_id: publicKey,
        sequence: '800',
        subentry_count: 0,
        last_modified_ledger: 200,
        thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
        flags: { auth_required: false, auth_revocable: false, auth_immutable: false },
        balances: [{ asset_type: 'native', balance: '20.0000000' }],
        signers: [],
        data_attr: {},
      };

      const loadAccount = jest
        .fn()
        .mockRejectedValueOnce({ response: { status: 503, headers: { 'retry-after': '0.2' } } })
        .mockResolvedValueOnce(mockAccount);
      setMockServer({ loadAccount });

      const response = await request(app).get(`/api/v1/accounts/${publicKey}`);

      expect(response.status).toBe(200);
      expect(response.body.data.sequence).toBe('800');
      expect(loadAccount).toHaveBeenCalledTimes(2);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 200);
    });

    it('returns a 502 with mapped message when Horizon fails after retry exhaustion', async () => {
      const setTimeoutSpy = runTimeoutsImmediately();
      const loadAccount = jest.fn().mockRejectedValue({
        response: { status: 503, data: { detail: 'Service temporarily overloaded' } },
      });
      setMockServer({ loadAccount });

      const response = await request(app).get(`/api/v1/accounts/${publicKey}`);

      expect(response.status).toBe(502);
      expect(response.body).toEqual({
        data: null,
        error: 'Stellar network error: Service temporarily overloaded',
      });
      expect(loadAccount).toHaveBeenCalledTimes(4);
      expect(setTimeoutSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('GET /api/v1/accounts/:publicKey/trustlines', () => {
    it('returns 400 with a validation error for an invalid public key', async () => {
      const response = await request(app).get('/api/v1/accounts/not-a-stellar-key/trustlines');

      expect(response.status).toBe(400);
      expect(response.body.data).toBeNull();
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.meta.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'publicKey' })])
      );
    });

    it('returns 200 with the trustlines array for an account with trustlines', async () => {
      const loadAccount = jest.fn().mockResolvedValueOnce({
        balances: [MOCK_NATIVE, MOCK_TRUSTLINE],
      });
      setMockServer({ loadAccount });

      const response = await request(app).get(`/api/v1/accounts/${publicKey}/trustlines`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: [MOCK_TRUSTLINE] });
      expect(loadAccount).toHaveBeenCalledWith(publicKey);
    });

    it('returns 200 with an empty array for an account with no trustlines', async () => {
      const loadAccount = jest.fn().mockResolvedValueOnce({
        balances: [MOCK_NATIVE],
      });
      setMockServer({ loadAccount });

      const response = await request(app).get(`/api/v1/accounts/${publicKey}/trustlines`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: [] });
    });

    it('returns 404 when Horizon reports the account does not exist', async () => {
      const loadAccount = jest.fn().mockRejectedValueOnce({
        response: { status: 404 },
      });
      setMockServer({ loadAccount });

      const response = await request(app).get(`/api/v1/accounts/${publicKey}/trustlines`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        data: null,
        error: 'Stellar account or asset not found.',
      });
    });

    it('returns 502 after retry exhaustion, calling loadAccount exactly 4 times', async () => {
      const setTimeoutSpy = runTimeoutsImmediately();
      const loadAccount = jest.fn().mockRejectedValue({
        response: { status: 503, data: { detail: 'Service unavailable' } },
      });
      setMockServer({ loadAccount });

      const response = await request(app).get(`/api/v1/accounts/${publicKey}/trustlines`);

      expect(response.status).toBe(502);
      expect(loadAccount).toHaveBeenCalledTimes(4);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 100);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(2, expect.any(Function), 200);
      expect(setTimeoutSpy).toHaveBeenNthCalledWith(3, expect.any(Function), 400);
    });
  });
});
