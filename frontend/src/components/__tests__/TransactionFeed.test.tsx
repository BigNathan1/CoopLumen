import { render, screen } from '@testing-library/react';
import { TransactionFeed } from '../TransactionFeed';
import { LocaleProvider } from '@/hooks/useLocale';
import {
  useTransactions,
  type StreamedPayment,
  type UseTransactionsResult,
} from '@/hooks/useTransactions';
import type { Locale } from '@/lib/i18n';

jest.mock('@/hooks/useTransactions', () => ({
  useTransactions: jest.fn(),
}));

const mockedUseTransactions = jest.mocked(useTransactions);

const PUBLIC_KEY = `G${'A'.repeat(55)}`;
const COUNTERPARTY = `G${'B'.repeat(55)}`;

/** The hook's return shape for a connected, empty feed, overridable per test. */
function feedState(overrides: Partial<UseTransactionsResult> = {}): UseTransactionsResult {
  return {
    transactions: [],
    latestTransaction: null,
    status: 'live',
    isConnected: true,
    error: null,
    clear: jest.fn(),
    ...overrides,
  };
}

function renderFeed(state: Partial<UseTransactionsResult> = {}, defaultLocale?: Locale) {
  mockedUseTransactions.mockReturnValue(feedState(state));

  return render(
    <LocaleProvider defaultLocale={defaultLocale}>
      <TransactionFeed publicKey={PUBLIC_KEY} />
    </LocaleProvider>
  );
}

function payment(overrides: Partial<StreamedPayment> = {}): StreamedPayment {
  return { id: 'op-1', ...overrides };
}

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
});

describe('TransactionFeed', () => {
  it('titles the panel from the catalog', () => {
    renderFeed();

    expect(screen.getByRole('heading', { name: 'Recent transactions' })).toBeInTheDocument();
  });

  it('shows the empty state before any payment arrives', () => {
    renderFeed();

    expect(screen.getByText('No transactions yet')).toBeInTheDocument();
  });

  it('renders each payment with its amount and asset', () => {
    renderFeed({
      transactions: [
        payment({
          id: 'op-1',
          amount: '10.0000000',
          asset_type: 'credit_alphanum4',
          asset_code: 'ECO',
        }),
      ],
    });

    expect(screen.getByText('10.0000000 ECO')).toBeInTheDocument();
  });

  it('names the native asset XLM rather than passing the type through', () => {
    renderFeed({ transactions: [payment({ amount: '5.0000000', asset_type: 'native' })] });

    expect(screen.getByText('5.0000000 XLM')).toBeInTheDocument();
  });

  it('keeps payments in the newest-first order the hook delivers', () => {
    renderFeed({
      transactions: [
        payment({ id: 'op-2', amount: '2.0000000', asset_type: 'native', to: PUBLIC_KEY }),
        payment({ id: 'op-1', amount: '1.0000000', asset_type: 'native', to: PUBLIC_KEY }),
      ],
    });

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Received2.0000000 XLM',
      'Received1.0000000 XLM',
    ]);
  });

  it('reads a payment to the followed account as received', () => {
    renderFeed({
      transactions: [payment({ amount: '1.0000000', asset_type: 'native', to: PUBLIC_KEY })],
    });

    expect(screen.getByText('Received')).toBeInTheDocument();
  });

  it('reads a payment from the followed account as sent', () => {
    renderFeed({
      transactions: [payment({ amount: '1.0000000', asset_type: 'native', to: COUNTERPARTY })],
    });

    expect(screen.getByText('Sent')).toBeInTheDocument();
  });

  it('falls back to a dash when a payment carries no asset code', () => {
    renderFeed({
      transactions: [payment({ amount: '1.0000000', asset_type: 'credit_alphanum4' })],
    });

    expect(screen.getByText('1.0000000 —')).toBeInTheDocument();
  });

  it('announces the newest payment through a polite live region', () => {
    renderFeed({
      transactions: [payment({ amount: '5.0000000', asset_type: 'native' })],
    });

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('New payment of 5.0000000 XLM');
  });

  it.each([
    ['live', 'Live'],
    ['connecting', 'Connecting…'],
    ['reconnecting', 'Reconnecting…'],
    ['idle', 'Offline'],
  ] as const)('reports the %s connection as "%s"', (status, label) => {
    renderFeed({ status });

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('shows a server-sent failure without dropping the list', () => {
    renderFeed({
      status: 'reconnecting',
      error: new Error('Horizon unavailable'),
      transactions: [payment({ amount: '1.0000000', asset_type: 'native' })],
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Horizon unavailable');
    expect(screen.getByText('1.0000000 XLM')).toBeInTheDocument();
  });

  it('stays idle and silent when no account is being followed', () => {
    mockedUseTransactions.mockReturnValue(feedState({ status: 'idle' }));

    render(
      <LocaleProvider>
        <TransactionFeed publicKey={null} />
      </LocaleProvider>
    );

    expect(mockedUseTransactions).toHaveBeenCalledWith({ publicKey: null });
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByText('No transactions yet')).toBeInTheDocument();
  });

  it('renders every string from the Swahili catalog when that is active', () => {
    renderFeed({ transactions: [payment({ amount: '5.0000000', asset_type: 'native' })] }, 'sw');

    expect(screen.getByRole('heading', { name: 'Miamala ya hivi karibuni' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Malipo mapya ya 5.0000000 XLM');
  });
});
