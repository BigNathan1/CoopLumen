import { getAccountOffers } from '../prices';
import { StellarService } from '../stellar';

jest.mock('../stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    call: jest.fn((_name: string, fn: () => unknown) => fn()),
  },
}));

describe('getAccountOffers', () => {
  const mockGetServer = StellarService.getServer as jest.Mock;
  const publicKey = 'GBUYXJ4MVNL4KXVR7ULKM7N5V2W5VLMZ4DPMQG4HNKQ3VHZK2Z2Z2Z';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists open DEX offers for an account', async () => {
    const mockCall = jest.fn().mockResolvedValue({
      records: [
        {
          id: 12345,
          paging_token: '12345-0',
          seller: publicKey,
          selling: { asset_type: 'native' },
          buying: {
            asset_type: 'credit_alphanum4',
            asset_code: 'ECO',
            asset_issuer: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ375AZLRIZJBIE6P',
          },
          amount: '100.0000000',
          price_r: { n: 1, d: 2 },
          price: '0.5000000',
        },
      ],
    });

    const offersMock = jest.fn().mockReturnValue({
      forAccount: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: mockCall,
        }),
      }),
    });

    mockGetServer.mockReturnValue({ offers: offersMock });

    const offers = await getAccountOffers(publicKey);

    expect(offers).toHaveLength(1);
    expect(offers[0]).toEqual({
      id: '12345',
      pagingToken: '12345-0',
      seller: publicKey,
      selling: { assetType: 'native' },
      buying: {
        assetType: 'credit_alphanum4',
        assetCode: 'ECO',
        assetIssuer: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ375AZLRIZJBIE6P',
      },
      amount: '100.0000000',
      priceR: { n: 1, d: 2 },
      price: '0.5000000',
    });
  });

  it('returns empty array when account has no open offers', async () => {
    const mockCall = jest.fn().mockResolvedValue({
      records: [],
    });

    const offersMock = jest.fn().mockReturnValue({
      forAccount: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          call: mockCall,
        }),
      }),
    });

    mockGetServer.mockReturnValue({ offers: offersMock });

    const offers = await getAccountOffers(publicKey);
    expect(offers).toEqual([]);
  });
});
