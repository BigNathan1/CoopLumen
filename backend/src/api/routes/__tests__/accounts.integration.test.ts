/**
 * Integration test: verifies loading account details from Stellar testnet Horizon.
 * Skipped gracefully when Horizon testnet is not reachable.
 */

import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import app from '../../../app';
import { StellarService } from '../../../contracts/stellar';

describe('Accounts testnet integration', () => {
  let isTestnetReachable = false;
  // Well-known persistent testnet account
  const testnetPublicKey = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

  beforeAll(async () => {
    isTestnetReachable = await StellarService.ping();
  });

  it('fetches real account details from Stellar testnet', async () => {
    if (!isTestnetReachable) {
      return;
    }

    const response = await request(app).get(`/api/v1/accounts/${testnetPublicKey}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.id).toBe(testnetPublicKey);
    expect(response.body.data.account_id).toBe(testnetPublicKey);
    expect(Array.isArray(response.body.data.balances)).toBe(true);
    expect(Array.isArray(response.body.data.signers)).toBe(true);
    expect(typeof response.body.data.sequence).toBe('string');
  });

  it('returns 404 for an unfunded valid public key on testnet', async () => {
    if (!isTestnetReachable) {
      return;
    }

    // Unfunded random valid public key
    const unfundedKey = Keypair.random().publicKey();
    const response = await request(app).get(`/api/v1/accounts/${unfundedKey}`);
    expect(response.status).toBe(404);
    expect(response.body.data).toBeNull();
    expect(response.body.error).toBe('Stellar account or asset not found.');
  });
});
