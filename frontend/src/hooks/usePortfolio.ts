import { useLoans, type Loan } from './useLoans';

/**
 * A member's net position in a single community asset: how much is still owed
 * *to* them (as lender) versus how much they still owe (as borrower), plus the
 * net of the two. All figures are the sum of `outstanding` across the member's
 * active loans in that asset.
 */
export interface AssetPosition {
  asset_code: string;
  owedToYou: number;
  youOwe: number;
  net: number;
}

/** Aggregate view of the member's loans in one role (lender or borrower). */
export interface RoleSummary {
  total: number;
  active: number;
  repaid: number;
  defaulted: number;
  /** Outstanding on active loans, keyed by asset code. */
  outstanding: Record<string, number>;
}

export interface Portfolio {
  positions: AssetPosition[];
  lending: RoleSummary;
  borrowing: RoleSummary;
  /** True when the member has no loans in either role. */
  isEmpty: boolean;
}

function summarize(loans: Loan[]): RoleSummary {
  const summary: RoleSummary = {
    total: loans.length,
    active: 0,
    repaid: 0,
    defaulted: 0,
    outstanding: {},
  };
  for (const loan of loans) {
    if (loan.status === 'active') {
      summary.active += 1;
      summary.outstanding[loan.asset_code] =
        (summary.outstanding[loan.asset_code] ?? 0) + Number(loan.outstanding);
    } else if (loan.status === 'repaid') {
      summary.repaid += 1;
    } else if (loan.status === 'defaulted') {
      summary.defaulted += 1;
    }
  }
  return summary;
}

/**
 * The connected member's lending/borrowing portfolio, derived from their loans
 * as lender and as borrower. Outstanding balances come straight from the API's
 * server-computed `outstanding` field, grouped per community asset so positions
 * in different assets are never summed together. Returns `{ portfolio, isLoading,
 * error }`; the portfolio object is always present so callers can render without
 * null-checks once loading settles.
 */
export function usePortfolio(address: string) {
  const lentQuery = useLoans({ lender: address, limit: 100 });
  const borrowedQuery = useLoans({ borrower: address, limit: 100 });

  const isLoading = lentQuery.isLoading || borrowedQuery.isLoading;
  const error = lentQuery.error ?? borrowedQuery.error;

  const lending = summarize(lentQuery.data ?? []);
  const borrowing = summarize(borrowedQuery.data ?? []);

  const assets = Array.from(
    new Set([...Object.keys(lending.outstanding), ...Object.keys(borrowing.outstanding)])
  ).sort();

  const positions: AssetPosition[] = assets.map((asset_code) => {
    const owedToYou = lending.outstanding[asset_code] ?? 0;
    const youOwe = borrowing.outstanding[asset_code] ?? 0;
    return { asset_code, owedToYou, youOwe, net: owedToYou - youOwe };
  });

  const portfolio: Portfolio = {
    positions,
    lending,
    borrowing,
    isEmpty: lending.total === 0 && borrowing.total === 0,
  };

  return { portfolio, isLoading, error };
}
