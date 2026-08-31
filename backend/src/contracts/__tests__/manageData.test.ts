import { Account, Keypair, Transaction } from '@stellar/stellar-sdk';
import { manageDatum } from '../manageData';
import { StellarService } from '../stellar';
import { StellarError } from '../errors';

jest.mock('../stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    loadAccount: jest.fn(),
    submitTransaction: jest.fn(),
    call: jest.fn((_name: string, req: () => unknown) => req()),
  },
}));

const mockLoadAccount = StellarService.loadAccount as jest.Mock;
const mockSubmit = StellarService.submitTransaction as jest.Mock;

const account = Keypair.random();

beforeEach(() => {
  mockLoadAccount.mockReset();
  mockSubmit.mockReset();
  mockLoadAccount.mockImplementation((publicKey: string) =>
    Promise.resolve(new Account(publicKey, '1'))
  );
  mockSubmit.mockResolvedValue({ hash: 'manage-data-hash' });
});

function submittedTransaction(): Transaction {
  const [transaction] = mockSubmit.mock.calls[0] as [Transaction];
  return transaction;
}

describe('manageDatum', () => {
  it('adds or updates a data entry with string value', async () => {
    const hash = await manageDatum({
      accountSecret: account.secret(),
      key: 'my_key',
      value: 'my_value',
    });

    expect(hash).toBe('manage-data-hash');
    expect(mockSubmit).toHaveBeenCalledTimes(1);

    const tx = submittedTransaction();
    expect(tx.operations).toHaveLength(1);
    expect(tx.operations[0].type).toBe('manageData');
    expect((tx.operations[0] as any).name).toBe('my_key');
    expect((tx.operations[0] as any).value).toEqual(Buffer.from('my_value', 'utf8'));
  });

  it('deletes a data entry when value is null', async () => {
    const hash = await manageDatum({
      accountSecret: account.secret(),
      key: 'my_key',
      value: null,
    });

    expect(hash).toBe('manage-data-hash');
    const tx = submittedTransaction();
    expect((tx.operations[0] as any).name).toBe('my_key');
    expect((tx.operations[0] as any).value).toBeNull();
  });

  it('rejects empty keys', async () => {
    await expect(
      manageDatum({
        accountSecret: account.secret(),
        key: '',
        value: 'val',
      })
    ).rejects.toThrow(StellarError);

    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('rejects keys exceeding 64 bytes', async () => {
    await expect(
      manageDatum({
        accountSecret: account.secret(),
        key: 'a'.repeat(65),
        value: 'val',
      })
    ).rejects.toThrow(StellarError);
  });

  it('rejects values exceeding 64 bytes', async () => {
    await expect(
      manageDatum({
        accountSecret: account.secret(),
        key: 'valid_key',
        value: 'a'.repeat(65),
      })
    ).rejects.toThrow(StellarError);
  });
});
