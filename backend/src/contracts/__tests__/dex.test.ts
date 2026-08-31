import { Keypair } from '@stellar/stellar-sdk';
import { getOrderBook, getAccountOffers } from '../dex';
import { StellarService } from '../stellar';
import { StellarError } from '../errors';

jest.mock('../stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    call: jest.fn((_name: string, fn: () => unknown) => fn()),
  },
}));

const mockGetServer = StellarService.getServer as jest.Mock;
const issuer = Keypair.random().publicKey();

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getOrderBook', () => {
  it('fetches and returns the order book for native and issued assets', async () => {
    const mockOrderBookCall = jest.fn().mockResolvedValue({
      bids: [{ price_r: { n: 1, d: 2 }, price: '0.5000000', amount: '100.0000000' }],
      asks: [{ price_r: { n: 3, d: 5 }, price: '0.6000000', amount: '200.0000000' }],
      base: { asset_type: 'native' },
      counter: {
        asset_type: 'credit_alphanum4',
        asset_code: 'ECO',
        asset_issuer: issuer,
      },
    });

    const mockOrderBookBuilder = { call: mockOrderBookCall };
    const mockServer = { orderbook: jest.fn().mockReturnValue(mockOrderBookBuilder) };
    mockGetServer.mockReturnValue(mockServer);

    const result = await getOrderBook({ code: 'XLM' }, { code: 'ECO', issuer: issuer });

    expect(mockServer.orderbook).toHaveBeenCalled();
    expect(mockOrderBookCall).toHaveBeenCalled();
    expect(result.bids).toHaveLength(1);
    expect(result.asks).toHaveLength(1);
    expect(result.bids[0].price).toBe('0.5000000');
  });

  it('throws an error if non-native asset lacks an issuer', async () => {
    await expect(getOrderBook({ code: 'XLM' }, { code: 'ECO' })).rejects.toThrow(
      'Asset issuer is required for non-native asset: ECO'
    );
  });

  it('maps Horizon errors via withStellarErrors', async () => {
    const horizonError = new Error('Not Found');
    (horizonError as any).response = {
      status: 404,
      data: { title: 'Not Found', detail: 'Resource missing' },
    };

    const mockServer = {
      orderbook: jest.fn().mockReturnValue({
        call: jest.fn().mockRejectedValue(horizonError),
      }),
    };
    mockGetServer.mockReturnValue(mockServer);

    await expect(
      getOrderBook({ code: 'XLM' }, { code: 'ECO', issuer: issuer })
    ).rejects.toBeInstanceOf(StellarError);
  });
});

describe('getAccountOffers', () => {
  const publicKey = 'GBUYXJ4MVNL4KXVR7ULKM7N5V2W5VLMZ4DPMQG4HNKQ3VHZK2Z2Z2Z';

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
            asset_issuer: issuer,
          },
          amount: '100.0000000',
          price_r: { n: 1, d: 2 },
          price: '0.5000000',
        },
      ],
    });

    const offersMock = jest.fn().mockReturnValue({
      forAccount: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({ call: mockCall }),
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
        assetIssuer: issuer,
      },
      amount: '100.0000000',
      priceR: { n: 1, d: 2 },
      price: '0.5000000',
    });
  });

  it('returns empty array when account has no open offers', async () => {
    const mockCall = jest.fn().mockResolvedValue({ records: [] });
    const offersMock = jest.fn().mockReturnValue({
      forAccount: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({ call: mockCall }),
      }),
    });
    mockGetServer.mockReturnValue({ offers: offersMock });

    const offers = await getAccountOffers(publicKey);
    expect(offers).toEqual([]);
  });
});
