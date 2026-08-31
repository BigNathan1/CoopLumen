/**
 * Live verification of `revokeTrustline()` against the Stellar testnet.
 *
 * Skipped unless `STELLAR_TESTNET_E2E=1`, so the default suite stays fast and
 * deterministic. Run it with:
 *
 *   STELLAR_TESTNET_E2E=1 npx jest trustlines.revoke.testnet
 *
 * Accounts are created fresh and funded by Friendbot on every run.
 */
import { Asset, BASE_FEE, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { establishTrustline, hasTrustline, revokeTrustline } from '../trustlines';
import { StellarService } from '../stellar';

const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const ASSET_CODE = 'REVTEST';
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

async function subentryCount(publicKey: string): Promise<number> {
  const account = await StellarService.loadAccount(publicKey);
  return account.subentry_count;
}

describeTestnet('revokeTrustline against Stellar testnet', () => {
  const issuer = Keypair.random();
  const holder = Keypair.random();
  const asset = new Asset(ASSET_CODE, issuer.publicKey());

  beforeAll(async () => {
    await Promise.all([fundAccount(issuer.publicKey()), fundAccount(holder.publicKey())]);
    await establishTrustline({
      accountSecret: holder.secret(),
      assetCode: ASSET_CODE,
      assetIssuer: issuer.publicKey(),
      limit: '1000',
    });
  });

  it('refuses to revoke while the trustline still holds a balance', async () => {
    await pay(issuer, holder.publicKey(), asset, '25');

    await expect(
      revokeTrustline({
        accountSecret: holder.secret(),
        assetCode: ASSET_CODE,
        assetIssuer: issuer.publicKey(),
      })
    ).rejects.toMatchObject({
      name: 'StellarOperationError',
      code: 'TRUSTLINE_HAS_BALANCE',
      httpStatus: 409,
    });

    expect(await hasTrustline(holder.publicKey(), ASSET_CODE, issuer.publicKey())).toBe(true);
  });

  it('removes the trustline and releases the base reserve once the balance is zero', async () => {
    await pay(holder, issuer.publicKey(), asset, '25');

    const subentriesBefore = await subentryCount(holder.publicKey());

    const txHash = await revokeTrustline({
      accountSecret: holder.secret(),
      assetCode: ASSET_CODE,
      assetIssuer: issuer.publicKey(),
    });

    expect(txHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hasTrustline(holder.publicKey(), ASSET_CODE, issuer.publicKey())).toBe(false);

    // The ledger entry is gone, so the account owns one fewer subentry and the
    // 0.5 XLM base reserve it locked is spendable again.
    expect(await subentryCount(holder.publicKey())).toBe(subentriesBefore - 1);
  });

  it('reports a second revocation as TRUSTLINE_MISSING rather than a raw Horizon error', async () => {
    await expect(
      revokeTrustline({
        accountSecret: holder.secret(),
        assetCode: ASSET_CODE,
        assetIssuer: issuer.publicKey(),
      })
    ).rejects.toMatchObject({ code: 'TRUSTLINE_MISSING', httpStatus: 404 });
  });

  it('maps an unfunded account to ACCOUNT_NOT_FOUND', async () => {
    await expect(
      revokeTrustline({
        accountSecret: Keypair.random().secret(),
        assetCode: ASSET_CODE,
        assetIssuer: issuer.publicKey(),
      })
    ).rejects.toMatchObject({ code: 'ACCOUNT_NOT_FOUND', httpStatus: 404 });
  });
});
