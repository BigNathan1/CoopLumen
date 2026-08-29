import { getOrderBook } from '../prices';
import { StellarService } from '../stellar';
import { StellarError } from '../errors';

jest.mock('../stellar', () => {
  const originalModule = jest.requireActual('../stellar');
  return {
    ...originalModule,
    StellarService: {
      getServer: jest.fn(),
      call: jest.fn((_name: string, fn: () => Promise<unknown>) => fn()),
    },
  };
});

describe('getOrderBook', () => {
  const mockGetServer = StellarService.getServer as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches order book for native and issued assets successfully', async () => {
    const mockOrderBookResult = {
      bids: [
        { price: '0.5', amount: '100.0', price_r: { n: 1, d: 2, price: '0.5' } },
      ],
      asks: [
        { price: '0.6', amount: '200.0', price_r: { n: 3, d: 5, price: '0.6' } },
      ],
      base: { asset_type: 'native' },
      counter: {
        asset_type: 'credit_alphanum4',
        asset_code: 'ECO',
        asset_issuer: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ375AZLRIZJBIE6P',
      },
    };

    const mockCall = jest.fn().mockResolvedValue(mockOrderBookResult);
    const mockOrderBookBuilder = {
      call: mockCall,
    };
    const mockOrderBookMethod = jest.fn().mockReturnValue(mockOrderBookBuilder);

    mockGetServer.mockReturnValue({
      orderBook: mockOrderBookMethod,
    });

    const result = await getOrderBook(
      { code: 'XLM' },
      {
        code: 'ECO',
        issuer: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ375AZLRIZJBIE6P',
      }
    );

    expect(result).toEqual(mockOrderBookResult);
    expect(mockOrderBookMethod).toHaveBeenCalled();
    expect(mockCall).toHaveBeenCalled();
  });

  it('throws an error when a non-native asset is missing its issuer', async () => {
    await expect(
      getOrderBook({ code: 'XLM' }, { code: 'ECO' })
    ).rejects.toThrow('Asset issuer is required for non-native asset code: ECO');
  });

  it('wraps Horizon errors into StellarError correctly', async () => {
    const horizonError = new Error('Bad Request');
    (horizonError as any).response = {
      status: 400,
      data: {
        title: 'Bad Request',
        detail: 'Invalid parameters',
      },
    };

    const mockCall = jest.fn().mockRejectedValue(horizonError);
    const mockOrderBookBuilder = {
      call: mockCall,
    };
    const mockOrderBookMethod = jest.fn().mockReturnValue(mockOrderBookBuilder);

    mockGetServer.mockReturnValue({
      orderBook: mockOrderBookMethod,
    });

    await expect(
      getOrderBook(
        { code: 'XLM' },
        {
          code: 'ECO',
          issuer: 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ375AZLRIZJBIE6P',
        }
      )
    ).rejects.toBeInstanceOf(StellarError);
  });
});
