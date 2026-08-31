/**
 * Live verification of `getTrustlineLimit()` against the Stellar testnet.
 *
 * Skipped unless `STELLAR_TESTNET_E2E=1`, so the default suite stays fast and
 * deterministic. Run it with:
 *
 *   STELLAR_TESTNET_E2E=1 npx jest trustlines.limit.testnet
 *
 * Accounts are created fresh and funded by Friendbot on every run.
 */
import { Asset, BASE_FEE, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { establishTrustline, getTrustlineLimit } from '../trustlines';
import { StellarService } from '../stellar';

const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const ASSET_CODE = 'LIMTEST';
const RUN_E2E = process.env.STELLAR_TESTNET_E2E === '1';
const describeTestnet = RUN_E2E ? describe : describe.skip;

jest.setTimeout(180_000);

async function fundAccount(publicKey: string): Promise<void> {
  const response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
  if (!response.ok) {
    throw new Error(`Friendbot funding failed for ${publicKey}: ${response.status}`);
  }
}

async function pay(from: Keypair, to: string, asset: Asset, amount: string): Promise<void> {
  const account = await StellarService.loadAccount(from.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: StellarService.getNetwork(),
  })
    .addOperation(Operation.payment({ destination: to, asset, amount }))
    .setTimeout(60)
    .build();

  tx.sign(from);
  await StellarService.submitTransaction(tx);
}

describeTestnet('getTrustlineLimit against Stellar testnet', () => {
  const issuer = Keypair.random();
  const holder = Keypair.random();
  const asset = new Asset(ASSET_CODE, issuer.publicKey());

  beforeAll(async () => {
    await Promise.all([fundAccount(issuer.publicKey()), fundAccount(holder.publicKey())]);
  });

  it('returns null before any trustline exists', async () => {
    await expect(
      getTrustlineLimit(holder.publicKey(), ASSET_CODE, issuer.publicKey())
    ).resolves.toBeNull();
  });

  it('reads back the limit exactly as it was configured', async () => {
    await establishTrustline({
      accountSecret: holder.secret(),
      assetCode: ASSET_CODE,
      assetIssuer: issuer.publicKey(),
      limit: '500.5000000',
    });

    await expect(
      getTrustlineLimit(holder.publicKey(), ASSET_CODE, issuer.publicKey())
    ).resolves.toEqual({
      limit: '500.5000000',
      balance: '0.0000000',
      available: '500.5000000',
      isAuthorized: true,
    });
  });

  it('reflects a payment in the balance and the remaining headroom', async () => {
    await pay(issuer, holder.publicKey(), asset, '120.2500000');

    await expect(
      getTrustlineLimit(holder.publicKey(), ASSET_CODE, issuer.publicKey())
    ).resolves.toMatchObject({
      limit: '500.5000000',
      balance: '120.2500000',
      available: '380.2500000',
    });
  });

  it('reflects a raised limit on the next read', async () => {
    await establishTrustline({
      accountSecret: holder.secret(),
      assetCode: ASSET_CODE,
      assetIssuer: issuer.publicKey(),
      limit: '900.0000000',
    });

    await expect(
      getTrustlineLimit(holder.publicKey(), ASSET_CODE, issuer.publicKey())
    ).resolves.toMatchObject({ limit: '900.0000000', available: '779.7500000' });
  });

  it('maps an account that does not exist to ACCOUNT_NOT_FOUND', async () => {
    await expect(
      getTrustlineLimit(Keypair.random().publicKey(), ASSET_CODE, issuer.publicKey())
    ).rejects.toMatchObject({
      name: 'StellarOperationError',
      code: 'ACCOUNT_NOT_FOUND',
      httpStatus: 404,
    });
  });
});
