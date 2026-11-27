import { Account, Horizon, Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import {
  StellarMultisigError,
  mapHorizonMultisigError,
  removeAccountSigner,
  setAccountSigners,
} from '../accountSigners';

const treasury = Keypair.random();
const signerA = Keypair.random().publicKey();
const signerB = Keypair.random().publicKey();

/** A Horizon server stand-in that records the transaction it is asked to submit. */
function fakeServer() {
  const submitted: string[] = [];
  const server = {
    loadAccount: jest.fn(async (id: string) => new Account(id, '100')),
    submitTransaction: jest.fn(async (tx: { toXDR(): string }) => {
      submitted.push(tx.toXDR());
      return { hash: 'tx-hash', ledger: 42 };
    }),
  } as unknown as Horizon.Server;
  return { server, submitted };
}

function operationsOf(xdr: string) {
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
  return 'operations' in tx ? tx.operations : [];
}

function horizonError(codes: { transaction?: string; operations?: string[] }, status = 400) {
  return { response: { status, data: { extras: { result_codes: codes } } } };
}

describe('setAccountSigners', () => {
  it('adds each signer and the thresholds in one transaction', async () => {
    const { server, submitted } = fakeServer();
    const result = await setAccountSigners(
      treasury,
      [
        { publicKey: signerA, weight: 1 },
        { publicKey: signerB, weight: 2 },
      ],
      { server, thresholds: { low: 1, med: 2, high: 3 } }
    );

    expect(result).toEqual({ hash: 'tx-hash', ledger: 42 });
    const ops = operationsOf(submitted[0]);
    expect(ops).toHaveLength(3);
    expect(ops[0]).toMatchObject({
      type: 'setOptions',
      signer: { ed25519PublicKey: signerA, weight: 1 },
    });
    expect(ops[2]).toMatchObject({ lowThreshold: 1, medThreshold: 2, highThreshold: 3 });
  });

  it('rejects an empty signer list', async () => {
    const { server } = fakeServer();
    await expect(setAccountSigners(treasury, [], { server })).rejects.toMatchObject({
      code: 'INVALID_SIGNERS',
    });
  });

  it('rejects an invalid key or weight before contacting Horizon', async () => {
    const { server } = fakeServer();
    await expect(
      setAccountSigners(treasury, [{ publicKey: 'GNOPE', weight: 1 }], { server })
    ).rejects.toMatchObject({ code: 'INVALID_SIGNER_KEY' });
    await expect(
      setAccountSigners(treasury, [{ publicKey: signerA, weight: 256 }], { server })
    ).rejects.toMatchObject({ code: 'INVALID_SIGNER_WEIGHT' });
    expect(server.loadAccount).not.toHaveBeenCalled();
  });

  it('maps a Horizon failure to a StellarMultisigError', async () => {
    const { server } = fakeServer();
    (server.submitTransaction as jest.Mock).mockRejectedValueOnce(
      horizonError({ transaction: 'tx_failed', operations: ['op_too_many_subentries'] })
    );
    await expect(
      setAccountSigners(treasury, [{ publicKey: signerA, weight: 1 }], { server })
    ).rejects.toMatchObject({ code: 'TOO_MANY_SIGNERS' });
  });
});

describe('removeAccountSigner', () => {
  it('sets the signer weight to zero', async () => {
    const { server, submitted } = fakeServer();
    await removeAccountSigner(treasury, signerA, { server });
    expect(operationsOf(submitted[0])[0]).toMatchObject({
      type: 'setOptions',
      signer: { ed25519PublicKey: signerA, weight: 0 },
    });
  });

  it('refuses to remove the master key', async () => {
    const { server } = fakeServer();
    await expect(
      removeAccountSigner(treasury, treasury.publicKey(), { server })
    ).rejects.toMatchObject({
      code: 'CANNOT_REMOVE_MASTER',
    });
  });
});

describe('mapHorizonMultisigError', () => {
  it.each([
    [horizonError({ operations: ['op_bad_threshold'] }), 'INVALID_THRESHOLDS'],
    [horizonError({ transaction: 'tx_bad_auth' }), 'INSUFFICIENT_SIGNATURE'],
    [horizonError({ transaction: 'tx_insufficient_balance' }), 'INSUFFICIENT_RESERVE'],
    [horizonError({}, 404), 'ACCOUNT_NOT_FOUND'],
    [new Error('socket hang up'), 'STELLAR_SUBMIT_FAILED'],
  ])('maps %o to %s', (err, code) => {
    const mapped = mapHorizonMultisigError(err);
    expect(mapped).toBeInstanceOf(StellarMultisigError);
    expect(mapped.code).toBe(code);
  });
});
