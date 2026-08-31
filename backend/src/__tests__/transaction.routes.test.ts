import { Request, Response } from 'express';
// Assuming you extract the handler function for direct testing, or use supertest.
// If using supertest, adapt the setup below. This follows the direct-handler invocation style.
import db from '../db'; 

jest.mock('../db', () => ({
  transactionLog: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
}));

describe('GET /api/v1/transactions/:communityId', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    mockReq = { 
      params: { communityId: '123e4567-e89b-12d3-a456-426614174000' },
      query: { page: '1', limit: '10' }
    };
    mockRes = { status: mockStatus };
    jest.clearAllMocks();
  });

  it('should return 400 if communityId is not a valid UUID', async () => {
    mockReq.params!.communityId = 'invalid-uuid';
    
    // Call your handler here (e.g., via supertest or direct function invocation)
    // await getCommunityTransactionsHandler(mockReq as Request, mockRes as Response);

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'Invalid request parameters' })
      })
    );
  });

  it('should return 200 with paginated transactions on success', async () => {
    const mockTx = [{ id: 'tx-1', action: 'payment_sent' }];
    (db.transactionLog.findMany as jest.Mock).mockResolvedValue(mockTx);
    (db.transactionLog.count as jest.Mock).mockResolvedValue(1);

    // Call your handler here
    // await getCommunityTransactionsHandler(mockReq as Request, mockRes as Response);

    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockJson).toHaveBeenCalledWith({
      data: mockTx,
      meta: {
        total: 1,
        page: 1,
        limit: 10,
        pages: 1,
        offset: 0,
      }
    });
    
    expect(db.transactionLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 10
    }));
  });
});