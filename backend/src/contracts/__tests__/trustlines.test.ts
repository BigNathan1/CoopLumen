import { hasTrustline } from '../trustlines';
import { StellarService } from '../stellar';

jest.mock('../stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    getAccountBalance: jest.fn(),
    loadAccount: jest.fn(),
  },
}));

describe('hasTrustline', () => {
  const mockLoadAccount = StellarService.loadAccount as jest.Mock;

  beforeEach(() => {
    mockLoadAccount.mockReset();
  });

  it('returns true when trustline exists', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      balances: [
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'ECO',
          asset_issuer: 'GISSUER',
          balance: '100.0000000',
        },
      ],
    });

    const result = await hasTrustline('GPUBKEY', 'ECO', 'GISSUER');
    expect(result).toBe(true);
  });

  it('returns false when no trustline exists', async () => {
    mockLoadAccount.mockResolvedValueOnce({
      balances: [{ asset_type: 'native', balance: '10.0000000' }],
    });

    const result = await hasTrustline('GPUBKEY', 'ECO', 'GISSUER');
    expect(result).toBe(false);
  });
});
