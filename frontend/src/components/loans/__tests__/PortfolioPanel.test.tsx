import { render, screen } from '@testing-library/react';
import { PortfolioPanel } from '../PortfolioPanel';
import * as hook from '@/hooks/usePortfolio';
import type { Portfolio } from '@/hooks/usePortfolio';

type UsePortfolioReturn = ReturnType<typeof hook.usePortfolio>;

function mockPortfolio(value: Partial<UsePortfolioReturn>): jest.SpyInstance {
  return jest
    .spyOn(hook, 'usePortfolio')
    .mockReturnValue({ isLoading: false, error: undefined, ...value } as UsePortfolioReturn);
}

const emptyRole = { total: 0, active: 0, repaid: 0, defaulted: 0, outstanding: {} };
const address = 'G' + 'B'.repeat(55);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('PortfolioPanel', () => {
  it('renders a loading state', () => {
    mockPortfolio({ isLoading: true });
    render(<PortfolioPanel address={address} />);
    expect(screen.getByText('Loading your portfolio…')).toBeInTheDocument();
  });

  it('prompts when the portfolio is empty', () => {
    mockPortfolio({
      portfolio: { positions: [], lending: emptyRole, borrowing: emptyRole, isEmpty: true },
    });
    render(<PortfolioPanel address={address} />);
    expect(screen.getByText(/lend or borrow to start/)).toBeInTheDocument();
  });

  it('shows role counts and per-asset net positions', () => {
    const portfolio: Portfolio = {
      lending: { total: 3, active: 2, repaid: 1, defaulted: 0, outstanding: { ECO: 100 } },
      borrowing: { total: 1, active: 1, repaid: 0, defaulted: 0, outstanding: { ECO: 30 } },
      positions: [{ asset_code: 'ECO', owedToYou: 100, youOwe: 30, net: 70 }],
      isEmpty: false,
    };
    mockPortfolio({ portfolio });
    render(<PortfolioPanel address={address} />);

    expect(screen.getByText('lending')).toBeInTheDocument();
    expect(screen.getByText('borrowing')).toBeInTheDocument();
    expect(screen.getByText('ECO')).toBeInTheDocument();
    expect(screen.getByText('+70.00')).toBeInTheDocument();
    expect(screen.getByText('+100.00 in')).toBeInTheDocument();
    expect(screen.getByText('−30.00 out')).toBeInTheDocument();
  });

  it('notes when there are loans but no active balances', () => {
    const portfolio: Portfolio = {
      lending: { total: 2, active: 0, repaid: 2, defaulted: 0, outstanding: {} },
      borrowing: emptyRole,
      positions: [],
      isEmpty: false,
    };
    mockPortfolio({ portfolio });
    render(<PortfolioPanel address={address} />);
    expect(screen.getByText(/every loan is settled/)).toBeInTheDocument();
  });
});
