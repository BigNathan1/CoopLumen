import { render, screen, fireEvent } from '@testing-library/react';
import { TransactionHistory } from '../TransactionHistory';
import { useTransactionHistory } from '@/hooks/useTransactions';
import type { TransactionLogEntry, PageMeta } from '@/hooks/useTransactions';

jest.mock('@/hooks/useTransactions');

const mockUseTransactionHistory = useTransactionHistory as jest.MockedFunction<
  typeof useTransactionHistory
>;

const ENTRY: TransactionLogEntry = {
  id: 'tx-1',
  community_id: 'comm-1',
  actor_address: 'G' + 'A'.repeat(55),
  action: 'payment_sent',
  stellar_tx_hash: 'a'.repeat(64),
  metadata: { amount: '10.0000000' },
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('TransactionHistory', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('announces a loading state through a polite status region', () => {
    mockUseTransactionHistory.mockReturnValue({
      data: undefined,
      meta: undefined,
      error: undefined,
      isLoading: true,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useTransactionHistory>);
    render(<TransactionHistory communityId="comm-1" />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Loading transaction history…');
  });

  it('announces a failure through an alert role', () => {
    mockUseTransactionHistory.mockReturnValue({
      data: undefined,
      meta: undefined,
      error: new Error('network down'),
      isLoading: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useTransactionHistory>);
    render(<TransactionHistory communityId="comm-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load transaction history');
  });

  it('shows an empty state when there is no history', () => {
    mockUseTransactionHistory.mockReturnValue({
      data: [],
      meta: { total: 0, page: 1, limit: 20, pages: 0, offset: 0 },
      error: undefined,
      isLoading: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useTransactionHistory>);
    render(<TransactionHistory communityId="comm-1" />);

    expect(screen.getByText('No transactions yet')).toBeInTheDocument();
  });

  it('renders an entry with its action, actor, tx hash link and timestamp', () => {
    mockUseTransactionHistory.mockReturnValue({
      data: [ENTRY],
      meta: { total: 1, page: 1, limit: 20, pages: 1, offset: 0 },
      error: undefined,
      isLoading: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useTransactionHistory>);
    render(<TransactionHistory communityId="comm-1" />);

    expect(screen.getByText('Payment sent')).toBeInTheDocument();
    expect(screen.getByTitle(ENTRY.actor_address!)).toBeInTheDocument();

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute(
      'href',
      `https://stellar.expert/explorer/public/tx/${ENTRY.stellar_tx_hash}`
    );
  });

  it('does not render pagination controls for a single page', () => {
    mockUseTransactionHistory.mockReturnValue({
      data: [ENTRY],
      meta: { total: 1, page: 1, limit: 20, pages: 1, offset: 0 },
      error: undefined,
      isLoading: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useTransactionHistory>);
    render(<TransactionHistory communityId="comm-1" />);

    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  it('renders pagination and requests the next page', () => {
    mockUseTransactionHistory.mockReturnValue({
      data: [ENTRY],
      meta: { total: 40, page: 1, limit: 20, pages: 2, offset: 0 },
      error: undefined,
      isLoading: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useTransactionHistory>);
    render(<TransactionHistory communityId="comm-1" />);

    const nextButton = screen.getByRole('button', { name: 'Go to next page' });
    expect(nextButton).toBeEnabled();
    fireEvent.click(nextButton);

    expect(mockUseTransactionHistory).toHaveBeenLastCalledWith('comm-1', {
      page: 2,
      limit: 20,
    });
  });
});
