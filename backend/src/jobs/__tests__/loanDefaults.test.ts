import { db } from '../../db';
import { detectLoanDefaults } from '../loanDefaults';
import { PoolClient } from 'pg';

jest.mock('../../db', () => ({
  db: {
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));

describe('detectLoanDefaults', () => {
  const mockDb = db as unknown as {
    query: jest.Mock;
    transaction: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when no loans are past due', async () => {
    mockDb.query.mockResolvedValueOnce([]);

    const result = await detectLoanDefaults();
    expect(result).toEqual([]);
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('detects and transitions overdue active loans to defaulted', async () => {
    const overdueLoan = {
      id: 'd9b2d63d-a51c-4b59-9b93-8b7425f190e1',
      community_id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      borrower_address: 'GBORROWER1111111111111111111111111111111111111111111111111',
      lender_address: 'GLENDER111111111111111111111111111111111111111111111111111',
      amount: '500.0000000',
      due_at: '2026-01-01T00:00:00Z',
    };

    mockDb.query.mockResolvedValueOnce([overdueLoan]);

    const mockClient = {
      query: jest.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('FOR UPDATE')) {
          return { rows: [overdueLoan] };
        }
        if (sql.includes('INSERT INTO reputation_scores')) {
          return { rows: [{ on_time_repayments: 2, defaults: 1 }] };
        }
        return { rows: [] };
      }),
    } as unknown as PoolClient;

    mockDb.transaction.mockImplementation(async (fn: (client: PoolClient) => Promise<unknown>) => {
      return fn(mockClient);
    });

    const result = await detectLoanDefaults();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(overdueLoan.id);
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE loans\n         SET status = 'defaulted'"),
      [overdueLoan.id]
    );
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO loan_events (loan_id, event_type, note)'),
      expect.any(Array)
    );
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO reputation_scores'),
      [overdueLoan.borrower_address, overdueLoan.community_id]
    );
  });
});
