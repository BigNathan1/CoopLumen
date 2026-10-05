import { render, screen, within } from '@testing-library/react';
import {
  TransactionHistory,
  formatAmount,
  truncateHash,
  type TransactionHistoryItem,
} from '@/components/transactions/TransactionHistory';

const HASH = 'a3f1c9d2e4b7a8f0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4';

const items: TransactionHistoryItem[] = [
  {
    id: 'tx-1',
    hash: HASH,
    type: 'payment_sent',
    amount: '1234.5000000',
    assetCode: 'SOLR',
    date: '2026-03-04T09:30:00.000Z',
    status: 'confirmed',
  },
  {
    id: 'tx-2',
    hash: null,
    type: 'loan_created',
    amount: '250.0000000',
    assetCode: null,
    date: '2026-03-02T15:00:00.000Z',
    status: 'recorded',
  },
  {
    id: 'tx-3',
    hash: null,
    type: 'member_added',
    amount: null,
    date: '2026-03-01T08:00:00.000Z',
    status: 'pending',
  },
  {
    id: 'tx-4',
    hash: 'b'.repeat(64),
    type: 'token_issued',
    amount: '10',
    date: '2026-02-28T08:00:00.000Z',
    status: 'failed',
  },
];

describe('TransactionHistory', () => {
  it('renders the hash, type, amount, date, and status column headers', () => {
    render(<TransactionHistory transactions={items} />);

    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Hash', 'Type', 'Amount', 'Date', 'Status']);
  });

  it('renders one body row per transaction, in the order given', () => {
    render(<TransactionHistory transactions={items} />);

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(items.length);
    expect(within(rows[0]).getByText('Payment sent')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Token issued')).toBeInTheDocument();
  });

  it('truncates the hash but exposes the full value in the link name, title, and href', () => {
    render(<TransactionHistory transactions={items} network="testnet" />);

    const link = screen.getByRole('link', {
      name: `View transaction ${HASH} on Stellar Expert`,
    });
    expect(link).toHaveTextContent('a3f1c9d2...f2a3b4');
    expect(link).toHaveAttribute('title', HASH);
    expect(link).toHaveAttribute('href', `https://stellar.expert/explorer/testnet/tx/${HASH}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('defaults explorer links to mainnet', () => {
    render(<TransactionHistory transactions={[items[0]]} />);

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      expect.stringContaining('/explorer/mainnet/tx/')
    );
  });

  it('offers a copy button only for entries that have a hash', () => {
    render(<TransactionHistory transactions={items} />);

    expect(screen.getAllByRole('button', { name: 'Copy hash' })).toHaveLength(2);
  });

  it('explains when an entry has no on-chain transaction', () => {
    render(<TransactionHistory transactions={[items[1]]} />);

    expect(screen.getByText('No on-chain transaction')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('formats amounts and appends the asset code when present', () => {
    render(<TransactionHistory transactions={items} />);

    expect(screen.getByText(/^1,234\.5/)).toHaveTextContent('1,234.5 SOLR');
    expect(screen.getByText('250')).toBeInTheDocument();
  });

  it('announces a missing amount to assistive technology', () => {
    render(<TransactionHistory transactions={[items[2]]} />);

    expect(screen.getByText('No amount')).toHaveClass('sr-only');
  });

  it('renders the date in a time element carrying the ISO value', () => {
    render(<TransactionHistory transactions={[items[0]]} />);

    const time = document.querySelector('time');
    expect(time).toHaveAttribute('datetime', '2026-03-04T09:30:00.000Z');
    expect(time?.textContent).not.toBe('');
  });

  it('falls back to the raw value when a date cannot be parsed', () => {
    render(<TransactionHistory transactions={[{ ...items[0], date: 'not-a-date' }]} />);

    expect(screen.getByText('not-a-date')).toBeInTheDocument();
  });

  it.each([
    ['confirmed', 'Confirmed', 'success'],
    ['pending', 'Pending', 'warning'],
    ['failed', 'Failed', 'error'],
    ['recorded', 'Recorded', 'neutral'],
  ] as const)('shows the %s status as text with the %s variant', (status, label, variant) => {
    render(<TransactionHistory transactions={[{ ...items[0], status }]} />);

    const badge = screen.getByText(label);
    expect(badge).toHaveAttribute('data-variant', variant);
  });

  it('humanizes action codes that have no curated label', () => {
    render(<TransactionHistory transactions={[{ ...items[0], type: 'vote_cast' }]} />);

    expect(screen.getByText('Vote cast')).toBeInTheDocument();
  });

  it('shows the empty state with guidance when there are no transactions', () => {
    render(<TransactionHistory transactions={[]} />);

    expect(screen.getByText(/No transactions yet/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Transaction history' })).toBeInTheDocument();
  });

  it('shows an accessible loading skeleton instead of the table', () => {
    render(<TransactionHistory transactions={[]} isLoading />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading transactions');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an alert instead of the table when loading failed', () => {
    render(<TransactionHistory transactions={[]} error="Community not found" />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not load transactions');
    expect(alert).toHaveTextContent('Community not found');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('prefers the loading state over a stale error', () => {
    render(<TransactionHistory transactions={[]} isLoading error="old error" />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lets callers rename the table for assistive technology', () => {
    render(<TransactionHistory transactions={items} ariaLabel="Solar Co-op transactions" />);

    expect(screen.getByRole('table', { name: 'Solar Co-op transactions' })).toBeInTheDocument();
  });
});

describe('formatAmount', () => {
  it.each([
    ['100.0000000', '100'],
    ['1234.5000000', '1,234.5'],
    ['1234567.1234567', '1,234,567.1234567'],
    ['0.0000001', '0.0000001'],
    ['-42.50', '-42.5'],
    ['7', '7'],
  ])('formats %s as %s', (input, expected) => {
    expect(formatAmount(input)).toBe(expected);
  });

  it('does not lose precision beyond what floating point can hold', () => {
    expect(formatAmount('9007199254740993.1234567')).toBe('9,007,199,254,740,993.1234567');
  });

  it('returns unparseable input unchanged', () => {
    expect(formatAmount('12abc')).toBe('12abc');
  });
});

describe('truncateHash', () => {
  it('shortens long hashes to start...end', () => {
    expect(truncateHash(HASH)).toBe('a3f1c9d2...f2a3b4');
  });

  it('leaves short values untouched', () => {
    expect(truncateHash('abc123')).toBe('abc123');
  });
});
