import { Horizon } from '@stellar/stellar-sdk';
import { getOrderBook } from '../prices';
import { StellarService } from '../stellar';
import { StellarError } from '../errors';

jest.mock('../stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    call: jest.fn((_name: string, fn: () => unknown) => fn()),
  },
}));

describe('getOrderBook', () => {
  const mockGetServer = StellarService.getServer as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches and returns the order book for native and issued assets', async () => {
    const mockOrderBookCall = jest.fn().mockResolvedValue({
      bids: [
        { price_r: { n: 1, d: 2 }, price: '0.5000000', amount: '100.0000000' },
      ],
      asks: [
        { price_r: { n: 3, d: 5 }, price: '0.6000000', amount: '200.0000000' },
      ],
      base: { asset_type: 'native' },
      counter: {
        asset_type: 'credit_alphanum4',
        asset_code: 'ECO',
        asset_issuer: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ375AZLRIZJBIE6P',
      },
    });

    const mockOrderBookBuilder = {
      call: mockOrderBookCall,
    };

    const mockServer = {
      orderBook: jest.fn().mockReturnValue(mockOrderBookBuilder),
    };

    mockGetServer.mockReturnValue(mockServer);

    const result = await getOrderBook(
      { code: 'XLM' },
      { code: 'ECO', issuer: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ375AZLRIZJBIE6P' }
    );

    expect(mockServer.orderBook).toHaveBeenCalled();
    expect(mockOrderBookCall).toHaveBeenCalled();
    expect(result.bids).toHaveLength(1);
    expect(result.asks).toHaveLength(1);
    expect(result.bids[0].price).toBe('0.5000000');
  });

  it('throws an error if non-native asset lacks an issuer', async () => {
    await expect(
      getOrderBook({ code: 'XLM' }, { code: 'ECO' })
    ).rejects.toThrow('Asset issuer is required for non-native asset: ECO');
  });

  it('maps Horizon errors via withStellarErrors', async () => {
    const horizonError = new Error('Not Found');
    (horizonError as any).response = {
      status: 404,
      data: { title: 'Not Found', detail: 'Resource missing' },
    };

    const mockServer = {
      orderBook: jest.fn().mockReturnValue({
        call: jest.fn().mockRejectedValue(horizonError),
      }),
    };

    mockGetServer.mockReturnValue(mockServer);

    await expect(
      getOrderBook({ code: 'XLM' }, { code: 'ECO', issuer: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ375AZLRIZJBIE6P' })
    ).rejects.toBeInstanceOf(StellarError);
  });
});
