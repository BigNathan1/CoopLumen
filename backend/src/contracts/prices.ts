import { Asset } from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { withStellarErrors } from './errors';

export interface AssetInput {
  code: string;
  issuer?: string;
}

export interface OrderBookPrice {
  n: number;
  d: number;
  price: string;
}

export interface OrderBookOffer {
  price_r: OrderBookPrice;
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

function toStellarAsset(input: AssetInput): Asset {
  if (!input.code || input.code === 'XLM') {
    return Asset.native();
  }
  if (!input.issuer) {
    throw new Error(`Asset issuer is required for non-native asset code: ${input.code}`);
  }
  return new Asset(input.code, input.issuer);
}

/**
 * Fetches the decentralized exchange (DEX) order book for a given trading pair from Horizon.
 *
 * @param selling Asset being sold
 * @param buying Asset being bought
 * @returns Order book containing bids, asks, base, and counter asset definitions
 */
export async function getOrderBook(
  selling: AssetInput,
  buying: AssetInput
): Promise<OrderBookResponse> {
  return withStellarErrors('getOrderBook', async () => {
    const server = StellarService.getServer();
    const sellingAsset = toStellarAsset(selling);
    const buyingAsset = toStellarAsset(buying);

    const record = await StellarService.call('orderBook', () =>
      server.orderBook(sellingAsset, buyingAsset).call()
    );

    return record as unknown as OrderBookResponse;
  });
}
