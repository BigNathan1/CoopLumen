/**
 * Live verification of `buildMultiSigPayment()` against the Stellar testnet.
 *
 * Skipped unless `STELLAR_TESTNET_E2E=1`, so the default suite stays fast and
 * deterministic. Run it with:
 *
 *   STELLAR_TESTNET_E2E=1 npx jest transactions.multisig.testnet
 *
 * A fresh Friendbot-funded account is reconfigured for 2-of-3 signing, and the
 * built envelope is submitted with too few and then enough signatures, so the
 * reported N-of-M requirement is checked against what the network enforces.
 */
import {
  BASE_FEE,
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { buildMultiSigPayment, submitSignedXdr } from '../transactions';
import { StellarService } from '../stellar';

const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const RUN_E2E = process.env.STELLAR_TESTNET_E2E === '1';
const describeTestnet = RUN_E2E ? describe : describe.skip;

jest.setTimeout(240_000);

async function fundAccount(publicKey: string): Promise<void> {
  const response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
  if (!response.ok) {
    throw new Error(`Friendbot funding failed for ${publicKey}: ${response.status}`);
  }
}

describeTestnet('buildMultiSigPayment against Stellar testnet', () => {
  const master = Keypair.random();
  const cosignerA = Keypair.random();
  const cosignerB = Keypair.random();
  const destination = Keypair.random();

  beforeAll(async () => {
    await Promise.all([fundAccount(master.publicKey()), fundAccount(destination.publicKey())]);

    // Turn the master account into a 2-of-3: three signers of weight 1 each,
    // with the medium threshold at 2.
    const account = await StellarService.loadAccount(master.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: StellarService.getNetwork(),
    })
      .addOperation(
        Operation.setOptions({
          signer: { ed25519PublicKey: cosignerA.publicKey(), weight: 1 },
        })
      )
      .addOperation(
        Operation.setOptions({
          signer: { ed25519PublicKey: cosignerB.publicKey(), weight: 1 },
        })
      )
      .addOperation(
        Operation.setOptions({
          masterWeight: 1,
          lowThreshold: 1,
          medThreshold: 2,
          highThreshold: 3,
        })
      )
      .setTimeout(60)
      .build();

    tx.sign(master);
    await StellarService.submitTransaction(tx);
  });

  it('reports the 2-of-3 requirement Horizon actually holds', async () => {
    const result = await buildMultiSigPayment({
      sourcePublicKey: master.publicKey(),
      destinationPublicKey: destination.publicKey(),
      assetCode: 'XLM',
      amount: '1',
    });

    expect(result.requiredWeight).toBe(2);
    expect(result.availableWeight).toBe(3);
    expect(result.minimumSignatures).toBe(2);
    expect(result.signers).toHaveLength(3);
    expect(result.signers.map((signer) => signer.key).sort()).toEqual(
      [master.publicKey(), cosignerA.publicKey(), cosignerB.publicKey()].sort()
    );

    // The envelope leaves this function unsigned.
    expect(new Transaction(result.xdr, result.networkPassphrase).signatures).toHaveLength(0);
  });

  it('is rejected by the network with only one of the two required signatures', async () => {
    const { xdr, networkPassphrase } = await buildMultiSigPayment({
      sourcePublicKey: master.publicKey(),
      destinationPublicKey: destination.publicKey(),
      assetCode: 'XLM',
      amount: '1',
    });

    const tx = new Transaction(xdr, networkPassphrase);
    tx.sign(master);

    await expect(submitSignedXdr(tx.toXDR())).rejects.toMatchObject({
      response: { status: 400 },
    });
  });

  it('is accepted once the minimum number of signatures is collected', async () => {
    const built = await buildMultiSigPayment({
      sourcePublicKey: master.publicKey(),
      destinationPublicKey: destination.publicKey(),
      assetCode: 'XLM',
      amount: '1',
      memo: 'multisig payout',
      timeoutSeconds: 120,
    });

    const tx = new Transaction(built.xdr, built.networkPassphrase);
    tx.sign(master, cosignerA);
    expect(tx.signatures).toHaveLength(built.minimumSignatures);

    const hash = await submitSignedXdr(tx.toXDR());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('maps a source account that does not exist to ACCOUNT_NOT_FOUND', async () => {
    await expect(
      buildMultiSigPayment({
        sourcePublicKey: Keypair.random().publicKey(),
        destinationPublicKey: destination.publicKey(),
        assetCode: 'XLM',
        amount: '1',
      })
    ).rejects.toMatchObject({
      name: 'StellarOperationError',
      code: 'ACCOUNT_NOT_FOUND',
      httpStatus: 404,
    });
  });
});
