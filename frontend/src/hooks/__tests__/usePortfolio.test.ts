import { renderHook } from '@testing-library/react';
import { usePortfolio } from '../usePortfolio';
import * as loansHook from '../useLoans';
import type { Loan, LoanFilters, LoanStatus } from '../useLoans';

function loan(overrides: Partial<Loan> = {}): Loan {
  const amount = overrides.amount ?? '100.0000000';
  return {
    id: 'loan',
    community_id: 'community-1',
    borrower_address: 'G' + 'A'.repeat(55),
    lender_address: 'G' + 'B'.repeat(55),
    amount,
    amount_repaid: '0',
    interest_rate: '0',
    total_due: amount,
    outstanding: amount,
    asset_code: 'ECO',
    asset_issuer: null,
    purpose: null,
    status: 'active' as LoanStatus,
    due_at: null,
    disbursed_at: null,
    closed_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

type UseLoansReturn = ReturnType<typeof loansHook.useLoans>;

function mockLoansByRole(lent: Loan[], borrowed: Loan[]) {
  jest.spyOn(loansHook, 'useLoans').mockImplementation(
    (filters: LoanFilters = {}) =>
      ({
        data: filters.lender ? lent : borrowed,
        isLoading: false,
        error: undefined,
      }) as unknown as UseLoansReturn
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('usePortfolio', () => {
  it('sums outstanding per role and nets the position', () => {
    mockLoansByRole(
      [
        loan({ outstanding: '60.0000000' }),
        loan({ outstanding: '40.0000000' }),
        loan({ status: 'repaid', outstanding: '0.0000000' }),
      ],
      [loan({ outstanding: '30.0000000' })]
    );

    const { result } = renderHook(() => usePortfolio('G' + 'B'.repeat(55)));
    const { portfolio } = result.current;

    expect(portfolio.lending.active).toBe(2);
    expect(portfolio.lending.repaid).toBe(1);
    expect(portfolio.borrowing.active).toBe(1);
    expect(portfolio.positions).toEqual([
      { asset_code: 'ECO', owedToYou: 100, youOwe: 30, net: 70 },
    ]);
  });

  it('keeps positions in different assets separate', () => {
    mockLoansByRole(
      [loan({ asset_code: 'ECO', outstanding: '50.0000000' })],
      [loan({ asset_code: 'SOL', outstanding: '20.0000000' })]
    );

    const { result } = renderHook(() => usePortfolio('G' + 'B'.repeat(55)));

    expect(result.current.portfolio.positions).toEqual([
      { asset_code: 'ECO', owedToYou: 50, youOwe: 0, net: 50 },
      { asset_code: 'SOL', owedToYou: 0, youOwe: 20, net: -20 },
    ]);
  });

  it('reports an empty portfolio when there are no loans', () => {
    mockLoansByRole([], []);
    const { result } = renderHook(() => usePortfolio('G' + 'B'.repeat(55)));
    expect(result.current.portfolio.isEmpty).toBe(true);
    expect(result.current.portfolio.positions).toEqual([]);
  });
});
