import { Asset } from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { withStellarErrors } from './errors';

export interface AssetInput {
  code: string;
  issuer?: string;
}

export interface OrderBookOffer {
  price_r: {
    n: number;
    d: number;
  };
  price: string;
  amount: string;
}

export interface OrderBookResponse {
  bids: OrderBookOffer[];
  asks: OrderBookOffer[];
  base: {
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
  };
  counter: {
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
  };
}

export interface DexOffer {
  id: string;
  pagingToken: string;
  seller: string;
  selling: {
    assetType: string;
    assetCode?: string;
    assetIssuer?: string;
  };
  buying: {
    assetType: string;
    assetCode?: string;
    assetIssuer?: string;
  };
  amount: string;
  priceR: {
    n: number;
    d: number;
  };
  price: string;
}

function toStellarAsset(input: AssetInput): Asset {
  const code = input.code.trim();
  if (!code || code.toUpperCase() === 'XLM' || code.toUpperCase() === 'NATIVE') {
    return Asset.native();
  }
  if (!input.issuer) {
    throw new Error(`Asset issuer is required for non-native asset: ${code}`);
  }
  return new Asset(code, input.issuer);
}

/**
 * Fetches the decentralized exchange (DEX) order book for a given trading pair
 * from Horizon, wrapped with retry and error mapping.
 *
 * @param selling Asset being sold (base)
 * @param buying Asset being bought (counter)
 * @returns The order book response containing bids and asks
 */
export async function getOrderBook(
  selling: AssetInput,
  buying: AssetInput
): Promise<OrderBookResponse> {
  return withStellarErrors('getOrderBook', async () => {
    const server = StellarService.getServer();
    const sellingAsset = toStellarAsset(selling);
    const buyingAsset = toStellarAsset(buying);

    const response = await StellarService.call('orderbook', () =>
      server.orderbook(sellingAsset, buyingAsset).call()
    );

    return response as unknown as OrderBookResponse;
  });
}

/**
 * Lists all open DEX offers for a given Stellar account public key.
 */
export async function getAccountOffers(publicKey: string): Promise<DexOffer[]> {
  return withStellarErrors('Get account offers', async () => {
    const server = StellarService.getServer();
    const offers: DexOffer[] = [];

    let page = await StellarService.call('offers.forAccount', () =>
      server.offers().forAccount(publicKey).limit(200).call()
    );

    while (page.records.length > 0) {
      for (const record of page.records) {
        offers.push({
          id: String(record.id),
          pagingToken: record.paging_token,
          seller: record.seller,
          selling: {
            assetType: record.selling.asset_type,
            ...(record.selling.asset_type !== 'native' && {
              assetCode: record.selling.asset_code,
              assetIssuer: record.selling.asset_issuer,
            }),
          },
          buying: {
            assetType: record.buying.asset_type,
            ...(record.buying.asset_type !== 'native' && {
              assetCode: record.buying.asset_code,
              assetIssuer: record.buying.asset_issuer,
            }),
          },
          amount: record.amount,
          priceR: {
            n: record.price_r.n,
            d: record.price_r.d,
          },
          price: record.price,
        });
      }

      if (page.records.length < 200) break;
      page = await StellarService.call('offers.forAccount.next', () => page.next());
    }

    return offers;
  });
}
