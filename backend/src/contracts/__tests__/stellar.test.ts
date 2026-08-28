import { Horizon } from '@stellar/stellar-sdk';
import {
  StellarService,
  UnfundedAccountError,
  StellarNetworkError,
  InvalidPublicKeyError,
} from '../stellar';

// Mock the Horizon.Server
jest.mock('@stellar/stellar-sdk', () => {
  const actualModule = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actualModule,
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        loadAccount: jest.fn(),
      })),
    },
  };
});

describe('StellarService.loadAccountSafe', () => {
  const publicKey = 'GBRPYHIL2CI3WHZDTOOQFC6EB4RBSGU2BARHTPGW5CUOA2MAIUZKSC66';
  const mockAccount = {
    id: publicKey,
    sequence: '123',
    balances: [{ asset_type: 'native', balance: '100.0000000' }],
  } as Horizon.AccountResponse;

  let mockServer: jest.Mocked<Horizon.Server>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServer = (StellarService.getServer() as unknown) as jest.Mocked<Horizon.Server>;
  });

  describe('successful account loading', () => {
    it('returns account data for a funded account', async () => {
      mockServer.loadAccount.mockResolvedValueOnce(mockAccount);

      const result = await StellarService.loadAccountSafe(publicKey);

      expect(result).toEqual(mockAccount);
      expect(mockServer.loadAccount).toHaveBeenCalledWith(publicKey);
    });

    it('returns account with multiple balances', async () => {
      const accountWithMultipleBalances = {
        ...mockAccount,
        balances: [
          { asset_type: 'native', balance: '50.0000000' },
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'ECO',
            asset_issuer: 'GISSUER',
            balance: '200.0000000',
          },
        ],
      } as Horizon.AccountResponse;

      mockServer.loadAccount.mockResolvedValueOnce(accountWithMultipleBalances);

      const result = await StellarService.loadAccountSafe(publicKey);

      expect(result).toEqual(accountWithMultipleBalances);
    });
  });

  describe('unfunded account (404)', () => {
    it('throws UnfundedAccountError when account does not exist', async () => {
      const error = {
        response: { status: 404 },
      };
      mockServer.loadAccount.mockRejectedValueOnce(error);

      await expect(StellarService.loadAccountSafe(publicKey)).rejects.toThrow(
        UnfundedAccountError
      );
    });

    it('UnfundedAccountError includes the public key in the message', async () => {
      const error = {
        response: { status: 404 },
      };
      mockServer.loadAccount.mockRejectedValueOnce(error);

      try {
        await StellarService.loadAccountSafe(publicKey);
        fail('Expected UnfundedAccountError');
      } catch (err) {
        expect(err).toBeInstanceOf(UnfundedAccountError);
        expect((err as Error).message).toContain(publicKey);
        expect((err as Error).message).toContain('does not exist');
      }
    });
  });

  describe('invalid public key (400)', () => {
    it('throws InvalidPublicKeyError for malformed key', async () => {
      const error = {
        response: { status: 400 },
        message: 'Invalid public key format',
      };
      mockServer.loadAccount.mockRejectedValueOnce(error);

      await expect(StellarService.loadAccountSafe('invalid-key')).rejects.toThrow(
        InvalidPublicKeyError
      );
    });

    it('InvalidPublicKeyError includes the attempted key in the message', async () => {
      const invalidKey = 'not-a-valid-key';
      const error = {
        response: { status: 400 },
        message: 'Invalid public key',
      };
      mockServer.loadAccount.mockRejectedValueOnce(error);

      try {
        await StellarService.loadAccountSafe(invalidKey);
        fail('Expected InvalidPublicKeyError');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidPublicKeyError);
        expect((err as Error).message).toContain(invalidKey);
      }
    });

    it('does not throw InvalidPublicKeyError for 400 without public key in message', async () => {
      const error = {
        response: {
          status: 400,
          data: { detail: 'Bad request' },
        },
      };
      mockServer.loadAccount.mockRejectedValueOnce(error);

      await expect(StellarService.loadAccountSafe(publicKey)).rejects.toThrow(
        StellarNetworkError
      );
    });
  });

  describe('network errors', () => {
    it('throws StellarNetworkError for 503 Service Unavailable', async () => {
      const error = {
        response: {
          status: 503,
          data: { detail: 'Horizon unavailable' },
        },
      };
      mockServer.loadAccount.mockRejectedValueOnce(error);

      await expect(StellarService.loadAccountSafe(publicKey)).rejects.toThrow(
        StellarNetworkError
      );
    });

    it('StellarNetworkError for 503 includes the detail', async () => {
      const detail = 'Service temporarily unavailable';
      const error = {
        response: {
          status: 503,
          data: { detail },
        },
      };
      mockServer.loadAccount.mockRejectedValueOnce(error);

      try {
        await StellarService.loadAccountSafe(publicKey);
        fail('Expected StellarNetworkError');
      } catch (err) {
        expect(err).toBeInstanceOf(StellarNetworkError);
        expect((err as Error).message).toContain(detail);
      }
    });

    it('throws StellarNetworkError for 429 Too Many Requests', async () => {
      const error = {
        response: {
          status: 429,
          data: { detail: 'Rate limit exceeded' },
        },
      };
      mockServer.loadAccount.mockRejectedValueOnce(error);

      await expect(StellarService.loadAccountSafe(publicKey)).rejects.toThrow(
        StellarNetworkError
      );
    });

    it('StellarNetworkError includes status code', async () => {
      const error = {
        response: {
          status: 502,
          data: { detail: 'Bad gateway' },
        },
      };
      mockServer.loadAccount.mockRejectedValueOnce(error);

      try {
        await StellarService.loadAccountSafe(publicKey);
        fail('Expected StellarNetworkError');
      } catch (err) {
        expect(err).toBeInstanceOf(StellarNetworkError);
        expect((err as StellarNetworkError).statusCode).toBe(502);
      }
    });

    it('throws StellarNetworkError for connection failures without status code', async () => {
      const error = new Error('Network timeout');
      mockServer.loadAccount.mockRejectedValueOnce(error);

      await expect(StellarService.loadAccountSafe(publicKey)).rejects.toThrow(
        StellarNetworkError
      );
    });

    it('StellarNetworkError for connection failures includes error message', async () => {
      const errorMsg = 'ECONNREFUSED: Connection refused';
      const error = new Error(errorMsg);
      mockServer.loadAccount.mockRejectedValueOnce(error);

      try {
        await StellarService.loadAccountSafe(publicKey);
        fail('Expected StellarNetworkError');
      } catch (err) {
        expect(err).toBeInstanceOf(StellarNetworkError);
        expect((err as Error).message).toContain(errorMsg);
      }
    });

    it('throws StellarNetworkError for 5xx status codes', async () => {
      const error = {
        response: {
          status: 500,
          data: { detail: 'Internal server error' },
        },
      };
      mockServer.loadAccount.mockRejectedValueOnce(error);

      await expect(StellarService.loadAccountSafe(publicKey)).rejects.toThrow(
        StellarNetworkError
      );
    });
  });

  describe('error type discrimination', () => {
    it('distinguishes between unfunded and network errors', async () => {
      // First call: unfunded
      mockServer.loadAccount.mockRejectedValueOnce({
        response: { status: 404 },
      });

      try {
        await StellarService.loadAccountSafe(publicKey);
        fail('Expected UnfundedAccountError');
      } catch (err) {
        expect(err).toBeInstanceOf(UnfundedAccountError);
        expect(err).not.toBeInstanceOf(StellarNetworkError);
      }

      // Second call: network error
      mockServer.loadAccount.mockRejectedValueOnce({
        response: { status: 503, data: { detail: 'Down' } },
      });

      try {
        await StellarService.loadAccountSafe(publicKey);
        fail('Expected StellarNetworkError');
      } catch (err) {
        expect(err).toBeInstanceOf(StellarNetworkError);
        expect(err).not.toBeInstanceOf(UnfundedAccountError);
      }
    });

    it('distinguishes between unfunded and invalid key errors', async () => {
      // Unfunded (404)
      mockServer.loadAccount.mockRejectedValueOnce({
        response: { status: 404 },
      });

      try {
        await StellarService.loadAccountSafe(publicKey);
        fail('Expected UnfundedAccountError');
      } catch (err) {
        expect(err).toBeInstanceOf(UnfundedAccountError);
        expect(err).not.toBeInstanceOf(InvalidPublicKeyError);
      }

      // Invalid key (400 with public key message)
      mockServer.loadAccount.mockRejectedValueOnce({
        response: { status: 400 },
        message: 'Invalid public key',
      });

      try {
        await StellarService.loadAccountSafe(publicKey);
        fail('Expected InvalidPublicKeyError');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidPublicKeyError);
        expect(err).not.toBeInstanceOf(UnfundedAccountError);
      }
    });
  });

  describe('retries and timeout behavior', () => {
    it('attempts retries before throwing StellarNetworkError for 503', async () => {
      mockServer.loadAccount
        .mockRejectedValueOnce({
          response: { status: 503, data: { detail: 'Temporarily unavailable' } },
        })
        .mockRejectedValueOnce({
          response: { status: 503, data: { detail: 'Temporarily unavailable' } },
        })
        .mockResolvedValueOnce(mockAccount);

      const result = await StellarService.loadAccountSafe(publicKey);

      expect(result).toEqual(mockAccount);
      expect(mockServer.loadAccount).toHaveBeenCalledTimes(3);
    });

    it('exhausts retries and throws StellarNetworkError after max attempts', async () => {
      mockServer.loadAccount.mockRejectedValue({
        response: { status: 503, data: { detail: 'Down' } },
      });

      await expect(StellarService.loadAccountSafe(publicKey)).rejects.toThrow(
        StellarNetworkError
      );

      // Should retry 4 times (HORIZON_RETRY_CONFIG.maxAttempts = 4)
      expect(mockServer.loadAccount).toHaveBeenCalledTimes(4);
    });

    it('does not retry non-retryable 404 errors', async () => {
      mockServer.loadAccount.mockRejectedValueOnce({
        response: { status: 404 },
      });

      await expect(StellarService.loadAccountSafe(publicKey)).rejects.toThrow(
        UnfundedAccountError
      );

      // Should only be called once (no retries for 404)
      expect(mockServer.loadAccount).toHaveBeenCalledTimes(1);
    });
  });

  describe('error message clarity', () => {
    it('provides clear message for unfunded account', async () => {
      mockServer.loadAccount.mockRejectedValueOnce({
        response: { status: 404 },
      });

      try {
        await StellarService.loadAccountSafe(publicKey);
        fail('Expected UnfundedAccountError');
      } catch (err) {
        const message = (err as Error).message;
        expect(message).toContain('does not exist');
        expect(message).toContain('not funded');
      }
    });

    it('provides clear message for network error with detail', async () => {
      const detail = 'Horizon database connection timeout';
      mockServer.loadAccount.mockRejectedValueOnce({
        response: {
          status: 503,
          data: { detail },
        },
      });

      try {
        await StellarService.loadAccountSafe(publicKey);
        fail('Expected StellarNetworkError');
      } catch (err) {
        const message = (err as Error).message;
        expect(message).toContain('Stellar network error');
        expect(message).toContain(detail);
      }
    });

    it('provides fallback message when no detail available', async () => {
      mockServer.loadAccount.mockRejectedValueOnce({
        response: { status: 503 },
      });

      try {
        await StellarService.loadAccountSafe(publicKey);
        fail('Expected StellarNetworkError');
      } catch (err) {
        const message = (err as Error).message;
        expect(message).toContain('Stellar network unavailable');
      }
    });
  });
});
