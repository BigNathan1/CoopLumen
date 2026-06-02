import { Horizon, Networks } from '@stellar/stellar-sdk';

type StellarNetwork = 'testnet' | 'mainnet';

const HORIZON_URLS: Record<StellarNetwork, string> = {
  testnet: 'https://horizon-testnet.stellar.org',
  mainnet: 'https://horizon.stellar.org',
};

const NETWORK_PASSPHRASES: Record<StellarNetwork, string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
};

class StellarServiceClass {
  private server: Horizon.Server;
  private network: string;

  constructor() {
    const env = (process.env.STELLAR_NETWORK ?? 'testnet') as StellarNetwork;
    const horizonUrl =
      process.env.STELLAR_HORIZON_URL ?? HORIZON_URLS[env];

    this.network = NETWORK_PASSPHRASES[env];
    this.server = new Horizon.Server(horizonUrl);
  }

  getServer(): Horizon.Server {
    return this.server;
  }

  getNetwork(): string {
    return this.network;
  }

  async getAccountBalance(
    publicKey: string
  ): Promise<Horizon.HorizonApi.BalanceLine[]> {
    const account = await this.server.loadAccount(publicKey);
    return account.balances;
  }

  async getTransactionHistory(
    publicKey: string,
    limit = 20
  ): Promise<Horizon.ServerApi.TransactionRecord[]> {
    const records = await this.server
      .transactions()
      .forAccount(publicKey)
      .limit(limit)
      .order('desc')
      .call();
    return records.records;
  }

  async ping(): Promise<boolean> {
    try {
      const network = (process.env.STELLAR_NETWORK ?? 'testnet') as StellarNetwork;
      const horizonUrl = process.env.STELLAR_HORIZON_URL ?? HORIZON_URLS[network];
      const response = await fetch(horizonUrl, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const StellarService = new StellarServiceClass();
