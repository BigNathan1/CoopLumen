import { Account, Asset, Keypair, Operation, Transaction } from '@stellar/stellar-sdk';

jest.mock('../stellar', () => ({
  StellarService: {
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    loadAccount: jest.fn(),
    submitTransaction: jest.fn(),
  },
}));

jest.mock('../../cache/balances', () => ({
  invalidateBalanceCache: jest.fn().mockResolvedValue(undefined),
}));

import { StellarService } from '../stellar';
import { invalidateBalanceCache } from '../../cache/balances';
import { StellarError } from '../errors';
import { authorizeTrustline, revokeTrustlineAuthorization, setTrustlineFlags } from '../trustlines';

const issuer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7));
const trustor = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 8)).publicKey();
const assetCode = 'COOP';

const loadAccount = StellarService.loadAccount as jest.Mock;
const submitTransaction = StellarService.submitTransaction as jest.Mock;

/** The error shape the Stellar SDK attaches to a rejected submission. */
function horizonFailure(transaction: string, operations?: string[]): unknown {
  return {
    response: {
      status: 400,
      data: {
        title: 'Transaction Failed',
        extras: { result_codes: { transaction, ...(operations && { operations }) } },
      },
    },
  };
}

/** Reads back the single setTrustLineFlags operation that was submitted. */
function submittedOperation(): Operation.SetTrustLineFlags {
  const transaction = submitTransaction.mock.calls[0][0] as Transaction;
  const operation = transaction.operations[0];
  if (operation.type !== 'setTrustLineFlags') {
    throw new Error(`expected a setTrustLineFlags operation, got ${operation.type}`);
  }
  return operation;
}

beforeEach(() => {
  jest.clearAllMocks();
  loadAccount.mockResolvedValue(new Account(issuer.publicKey(), '10'));
  submitTransaction.mockResolvedValue({ hash: 'flags-hash' });
});

describe('setTrustlineFlags', () => {
  it('sets the requested flags on the trustor and signs as the issuer', async () => {
    const hash = await setTrustlineFlags({
      issuerSecret: issuer.secret(),
      trustorPublicKey: trustor,
      assetCode,
      flags: { authorized: true, clawbackEnabled: true },
    });

    expect(hash).toBe('flags-hash');
    expect(loadAccount).toHaveBeenCalledWith(issuer.publicKey());

    const transaction = submitTransaction.mock.calls[0][0] as Transaction;
    expect(transaction.signatures).toHaveLength(1);
    expect(transaction.operations).toHaveLength(1);

    const operation = submittedOperation();
    expect(operation.trustor).toBe(trustor);
    expect(operation.asset.equals(new Asset(assetCode, issuer.publicKey()))).toBe(true);
    expect(operation.flags).toEqual({ authorized: true, clawbackEnabled: true });
  });

  it('clears a flag when it is set to false', async () => {
    await setTrustlineFlags({
      issuerSecret: issuer.secret(),
      trustorPublicKey: trustor,
      assetCode,
      flags: { authorized: false },
    });

    expect(submittedOperation().flags).toEqual({ authorized: false });
  });

  it('leaves omitted flags untouched', async () => {
    await setTrustlineFlags({
      issuerSecret: issuer.secret(),
      trustorPublicKey: trustor,
      assetCode,
      flags: { authorizedToMaintainLiabilities: true },
    });

    const flags = submittedOperation().flags;
    expect(flags).toEqual({ authorizedToMaintainLiabilities: true });
    expect(flags.authorized).toBeUndefined();
    expect(flags.clawbackEnabled).toBeUndefined();
  });

  it('derives the asset from the issuer secret so a mismatched issuer is impossible', async () => {
    await setTrustlineFlags({
      issuerSecret: issuer.secret(),
      trustorPublicKey: trustor,
      assetCode,
      flags: { authorized: true },
    });

    expect(submittedOperation().asset.getIssuer()).toBe(issuer.publicKey());
  });

  it('invalidates the cached balances of the trustor', async () => {
    await setTrustlineFlags({
      issuerSecret: issuer.secret(),
      trustorPublicKey: trustor,
      assetCode,
      flags: { authorized: true },
    });

    expect(invalidateBalanceCache).toHaveBeenCalledWith([trustor]);
  });

  it('explains op_cant_revoke when the issuer is not set as revocable', async () => {
    submitTransaction.mockRejectedValueOnce(horizonFailure('tx_failed', ['op_cant_revoke']));

    await expect(
      setTrustlineFlags({
        issuerSecret: issuer.secret(),
        trustorPublicKey: trustor,
        assetCode,
        flags: { authorized: false },
      })
    ).rejects.toMatchObject({
      name: 'StellarError',
      status: 400,
      message:
        'Trustline flag update failed: the issuer cannot revoke authorization because it is not set as revocable (op_cant_revoke)',
      resultCodes: { transaction: 'tx_failed', operations: ['op_cant_revoke'] },
    });
  });

  it('explains a missing trustline on the trustor', async () => {
    // Horizon answers a setTrustLineFlags against a non-existent trustline with
    // op_no_trust; op_no_trust_line is what the XDR enum calls the same case.
    submitTransaction.mockRejectedValueOnce(horizonFailure('tx_failed', ['op_no_trust']));

    await expect(
      setTrustlineFlags({
        issuerSecret: issuer.secret(),
        trustorPublicKey: trustor,
        assetCode,
        flags: { authorized: true },
      })
    ).rejects.toThrow(
      'Trustline flag update failed: the target account has no trustline for this asset (op_no_trust)'
    );
  });

  it('reports an unfunded issuer account as a 404', async () => {
    loadAccount.mockRejectedValueOnce({ response: { status: 404 } });

    await expect(
      setTrustlineFlags({
        issuerSecret: issuer.secret(),
        trustorPublicKey: trustor,
        assetCode,
        flags: { authorized: true },
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects an invalid issuer secret before contacting Horizon', async () => {
    await expect(
      setTrustlineFlags({
        issuerSecret: 'nope',
        trustorPublicKey: trustor,
        assetCode,
        flags: { authorized: true },
      })
    ).rejects.toThrow(
      'Trustline flag update failed: the issuer secret is not a valid Stellar secret key'
    );
    expect(loadAccount).not.toHaveBeenCalled();
  });

  it('rejects an invalid trustor before contacting Horizon', async () => {
    await expect(
      setTrustlineFlags({
        issuerSecret: issuer.secret(),
        trustorPublicKey: 'GNOPE',
        assetCode,
        flags: { authorized: true },
      })
    ).rejects.toThrow(
      'Trustline flag update failed: the trustor is not a valid Stellar public key'
    );
    expect(loadAccount).not.toHaveBeenCalled();
  });

  it('rejects an issuer trying to flag its own account', async () => {
    await expect(
      setTrustlineFlags({
        issuerSecret: issuer.secret(),
        trustorPublicKey: issuer.publicKey(),
        assetCode,
        flags: { authorized: true },
      })
    ).rejects.toThrow(
      'Trustline flag update failed: an issuer does not hold a trustline to its own asset'
    );
  });

  it('rejects a call that would change nothing', async () => {
    await expect(
      setTrustlineFlags({
        issuerSecret: issuer.secret(),
        trustorPublicKey: trustor,
        assetCode,
        flags: {},
      })
    ).rejects.toThrow(
      'Trustline flag update failed: at least one of the authorization flags must be set or cleared'
    );
    expect(loadAccount).not.toHaveBeenCalled();
  });

  it('rejects a malformed asset code', async () => {
    await expect(
      setTrustlineFlags({
        issuerSecret: issuer.secret(),
        trustorPublicKey: trustor,
        assetCode: 'THIRTEEN_CHAR',
        flags: { authorized: true },
      })
    ).rejects.toBeInstanceOf(StellarError);
    expect(loadAccount).not.toHaveBeenCalled();
  });

  it('does not invalidate cached balances when the submission fails', async () => {
    submitTransaction.mockRejectedValueOnce(horizonFailure('tx_failed', ['op_cant_revoke']));

    await expect(
      setTrustlineFlags({
        issuerSecret: issuer.secret(),
        trustorPublicKey: trustor,
        assetCode,
        flags: { authorized: false },
      })
    ).rejects.toBeInstanceOf(StellarError);
    expect(invalidateBalanceCache).not.toHaveBeenCalled();
  });
});

describe('authorizeTrustline', () => {
  it('sets the authorized flag', async () => {
    await authorizeTrustline({
      issuerSecret: issuer.secret(),
      trustorPublicKey: trustor,
      assetCode,
    });

    expect(submittedOperation().flags).toEqual({ authorized: true });
  });
});

describe('revokeTrustlineAuthorization', () => {
  it('clears authorization outright by default', async () => {
    await revokeTrustlineAuthorization({
      issuerSecret: issuer.secret(),
      trustorPublicKey: trustor,
      assetCode,
    });

    expect(submittedOperation().flags).toEqual({
      authorized: false,
      authorizedToMaintainLiabilities: false,
    });
  });

  it('downgrades to maintain-liabilities when asked to keep them', async () => {
    await revokeTrustlineAuthorization({
      issuerSecret: issuer.secret(),
      trustorPublicKey: trustor,
      assetCode,
      keepLiabilities: true,
    });

    expect(submittedOperation().flags).toEqual({
      authorized: false,
      authorizedToMaintainLiabilities: true,
    });
  });
});
