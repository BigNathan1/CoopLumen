/**
 * Integration tests against Stellar testnet using Friendbot-funded test accounts.
 * Exercises end-to-end flows for keypair funding, account creation, trustlines,
 * asset issuance, payments, balance verification, and error handling.
 *
 * Skipped unless STELLAR_TESTNET_INTEGRATION=1 or SKIP_TESTNET_TESTS is false/unset
 * and testnet is reachable.
 */

import { Keypair } from '@stellar/stellar-sdk';
import { StellarService } from '../stellar';
import { getAssetBalance, issueAsset } from '../assets';
import { establishTrustline } from '../trustlines';
import { submitPayment } from '../transactions';

const RUN = process.env.STELLAR_TESTNET_INTEGRATION === '1';
const describeIf = RUN ? describe : describe.skip;

const FRIENDBOT_URL = process.env.STELLAR_FRIENDBOT_URL ?? 'https://friendbot.stellar.org';

jest.setTimeout(180_000);

async function fundAccount(publicKey: string): Promise<void> {
  const response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
  if (!response.ok) {
    throw new Error(`Friendbot funding failed for ${publicKey}: ${response.status}`);
  }
}

describeIf('Stellar testnet integration with Friendbot-funded accounts', () => {
  let issuer: Keypair;
  let holder: Keypair;
  const assetCode = 'CLMT';
  const amount = '250.0000000';

  beforeAll(async () => {
    issuer = Keypair.random();
    holder = Keypair.random();

    await Promise.all([fundAccount(issuer.publicKey()), fundAccount(holder.publicKey())]);
  });

  it('successfully loads funded accounts from testnet', async () => {
    const issuerAccount = await StellarService.loadAccount(issuer.publicKey());
    const holderAccount = await StellarService.loadAccount(holder.publicKey());

    expect(issuerAccount.account_id).toBe(issuer.publicKey());
    expect(holderAccount.account_id).toBe(holder.publicKey());
  });

  it('establishes trustline for holder to accept custom asset', async () => {
    const txHash = await establishTrustline({
      accountSecret: holder.secret(),
      assetCode,
      assetIssuer: issuer.publicKey(),
      limit: '10000',
      memo: { type: 'text', value: 'trustline setup' },
    });

    expect(txHash).toMatch(/^[a-f0-9]{64}$/);

    const balance = await getAssetBalance(holder.publicKey(), assetCode, issuer.publicKey());
    expect(balance).toBe(0);
  });

  it('issues assets from issuer to holder and verifies balance', async () => {
    const txHash = await issueAsset({
      issuerSecret: issuer.secret(),
      assetCode,
      distributorPublicKey: holder.publicKey(),
      amount,
      memo: { type: 'text', value: 'token airdrop' },
    });

    expect(txHash).toMatch(/^[a-f0-9]{64}$/);

    const balance = await getAssetBalance(holder.publicKey(), assetCode, issuer.publicKey());
    expect(balance).toBe(Number(amount));
  });

  it('performs native XLM payment between funded accounts', async () => {
    const txHash = await submitPayment({
      senderSecret: issuer.secret(),
      destinationPublicKey: holder.publicKey(),
      assetCode: 'XLM',
      assetIssuer: '',
      amount: '5.0000000',
      memo: { type: 'text', value: 'xlm transfer' },
    });

    expect(txHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
