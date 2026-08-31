import { Request, Response } from 'express';
import { submitTransactionHandler } from '../submit';
import * as StellarSdk from '@stellar/stellar-sdk';

// Mock the Stellar SDK
jest.mock('@stellar/stellar-sdk', () => {
  const actualStellar = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actualStellar,
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        submitTransaction: jest.fn(),
      })),
    },
    TransactionBuilder: {
      fromXDR: jest.fn(),
    },
  };
});

describe('POST /api/v1/transactions/submit', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let serverInstance: any;

  beforeEach(() => {
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockReq = { body: {} };
    mockRes = { status: mockStatus };
    
    // Retrieve the mocked server instance
    serverInstance = new StellarSdk.Horizon.Server('dummy');
    jest.clearAllMocks();
  });

  it('should return 400 if XDR is missing', async () => {
    mockReq.body = {};
    
    await submitTransactionHandler(mockReq as Request, mockRes as Response);
    
    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ message: 'Invalid request payload' }) })
    );
  });

  it('should return 200 and transaction hash on success', async () => {
    mockReq.body = { xdr: 'AAAAAgAAA...' };
    
    (StellarSdk.TransactionBuilder.fromXDR as jest.Mock).mockReturnValue({});
    serverInstance.submitTransaction.mockResolvedValue({
      hash: '0x123abc',
      ledger: 123456,
    });

    await submitTransactionHandler(mockReq as Request, mockRes as Response);

    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { hash: '0x123abc', ledger: 123456, status: 'success' },
        meta: expect.any(Object)
      })
    );
  });

  it('should map tx_bad_seq error correctly', async () => {
    mockReq.body = { xdr: 'AAAAAgAAA...' };
    (StellarSdk.TransactionBuilder.fromXDR as jest.Mock).mockReturnValue({});
    
    const horizonError = {
      response: {
        status: 400,
        data: {
          extras: { result_codes: { transaction: 'tx_bad_seq' } }
        }
      }
    };
    serverInstance.submitTransaction.mockRejectedValue(horizonError);

    await submitTransactionHandler(mockReq as Request, mockRes as Response);

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith({
      error: {
        message: 'Transaction sequence number is out of sync. Please refresh your wallet state and try again.',
        rawCode: 'tx_bad_seq'
      }
    });
  });

  it('should map operation-level op_no_trust error correctly', async () => {
    mockReq.body = { xdr: 'AAAAAgAAA...' };
    (StellarSdk.TransactionBuilder.fromXDR as jest.Mock).mockReturnValue({});
    
    const horizonError = {
      response: {
        status: 400,
        data: {
          extras: { result_codes: { transaction: 'tx_failed', operations: ['op_no_trust'] } }
        }
      }
    };
    serverInstance.submitTransaction.mockRejectedValue(horizonError);

    await submitTransactionHandler(mockReq as Request, mockRes as Response);

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith({
      error: {
        message: 'Destination account does not have a trustline for this asset.',
        rawCode: 'tx_failed'
      }
    });
  });
});