import { Horizon } from '@stellar/stellar-sdk';
import { StellarService } from './stellar';
import { withStellarErrors } from './errors';

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
              assetCode: (record.selling as Horizon.ServerApi.AssetLine).asset_code,
              assetIssuer: (record.selling as Horizon.ServerApi.AssetLine).asset_issuer,
            }),
          },
          buying: {
            assetType: record.buying.asset_type,
            ...(record.buying.asset_type !== 'native' && {
              assetCode: (record.buying as Horizon.ServerApi.AssetLine).asset_code,
              assetIssuer: (record.buying as Horizon.ServerApi.AssetLine).asset_issuer,
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
