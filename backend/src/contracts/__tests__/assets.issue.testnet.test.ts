/**
 * Live verification of `issueAsset()` against the Stellar testnet.
 *
 * Skipped unless `STELLAR_TESTNET_E2E=1`, so the default suite stays fast and
 * deterministic. Run it with:
 *
 *   STELLAR_TESTNET_E2E=1 npx jest assets.issue.testnet
 *
 * It funds fresh issuer and distributor accounts via Friendbot, so it never
 * touches shared keys and leaves no state behind that matters.
 */
import { Asset, BASE_FEE, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { issueAsset } from '../assets';
import { StellarService } from '../stellar';

const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const ASSET_CODE = 'ECOTEST';
const RUN_E2E = process.env.STELLAR_TESTNET_E2E === '1';
const describeTestnet = RUN_E2E ? describe : describe.skip;

jest.setTimeout(180_000);

async function fundAccount(publicKey: string): Promise<void> {
  const response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
  if (!response.ok) {
    throw new Error(`Friendbot funding failed for ${publicKey}: ${response.status}`);
  }
}

async function trust(holder: Keypair, asset: Asset, limit?: string): Promise<void> {
  const account = await StellarService.loadAccount(holder.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: StellarService.getNetwork(),
  })
    .addOperation(Operation.changeTrust({ asset, ...(limit !== undefined && { limit }) }))
    .setTimeout(60)
    .build();

  tx.sign(holder);
  await StellarService.submitTransaction(tx);
}

async function balanceOf(publicKey: string, asset: Asset): Promise<string | undefined> {
  const account = await StellarService.loadAccount(publicKey);
  return account.balances.find(
    (line) =>
      line.asset_type !== 'native' &&
      'asset_code' in line &&
      line.asset_code === asset.getCode() &&
      line.asset_issuer === asset.getIssuer()
  )?.balance;
}

describeTestnet('issueAsset against Stellar testnet', () => {
  const issuer = Keypair.random();
  const distributor = Keypair.random();
  const asset = new Asset(ASSET_CODE, issuer.publicKey());

  beforeAll(async () => {
    await Promise.all([fundAccount(issuer.publicKey()), fundAccount(distributor.publicKey())]);
  });

  it('rejects issuance to a distributor with no trustline, mapped not raw', async () => {
    await expect(
      issueAsset({
        issuerSecret: issuer.secret(),
        assetCode: ASSET_CODE,
        distributorPublicKey: distributor.publicKey(),
        amount: '10',
      })
    ).rejects.toMatchObject({
      name: 'StellarOperationError',
      code: 'TRUSTLINE_MISSING',
      httpStatus: 422,
    });
  });

  it('credits the distributor once a trustline exists', async () => {
    await trust(distributor, asset, '1000');

    const txHash = await issueAsset({
      issuerSecret: issuer.secret(),
      assetCode: ASSET_CODE,
      distributorPublicKey: distributor.publicKey(),
      amount: '250',
      memo: 'testnet issuance',
    });

    expect(txHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await balanceOf(distributor.publicKey(), asset)).toBe('250.0000000');
  });

  it('maps an over-limit issuance to TRUSTLINE_LIMIT_EXCEEDED', async () => {
    await expect(
      issueAsset({
        issuerSecret: issuer.secret(),
        assetCode: ASSET_CODE,
        distributorPublicKey: distributor.publicKey(),
        amount: '5000',
      })
    ).rejects.toMatchObject({ code: 'TRUSTLINE_LIMIT_EXCEEDED', httpStatus: 422 });
  });

  it('maps an unfunded issuer to ACCOUNT_NOT_FOUND', async () => {
    const unfunded = Keypair.random();

    await expect(
      issueAsset({
        issuerSecret: unfunded.secret(),
        assetCode: ASSET_CODE,
        distributorPublicKey: distributor.publicKey(),
        amount: '1',
      })
    ).rejects.toMatchObject({ code: 'ACCOUNT_NOT_FOUND', httpStatus: 404 });
  });
});
