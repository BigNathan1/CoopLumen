import { Asset, Horizon } from '@stellar/stellar-sdk';
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

    const response = await StellarService.call('orderBook', () =>
      server.orderBook(sellingAsset, buyingAsset).call()
    );

    return response as unknown as OrderBookResponse;
  });
}
