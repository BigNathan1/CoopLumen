import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PaginationInner, type PaginationInnerProps } from '@/components/ui/Pagination';

/**
 * A mock pagination state that simulates the hook's interface without touching
 * URL search params. Each call to setPage updates the local state and re-renders.
 */
function useMockPagination(initialPage: number, totalPages: number) {
  const [page, setPage] = useState(initialPage);

  return {
    page,
    totalPages,
    setPage: (target: number) => setPage(Math.min(Math.max(1, target), totalPages)),
    nextPage: () => setPage((p) => Math.min(p + 1, totalPages)),
    prevPage: () => setPage((p) => Math.max(p - 1, 1)),
    isFirstPage: page <= 1,
    isLastPage: page >= totalPages,
  };
}

function ControlledPagination({
  initialPage = 1,
  totalPages = 10,
  maxVisible,
}: {
  initialPage?: number;
  totalPages?: number;
  maxVisible?: number;
}) {
  const pagination = useMockPagination(initialPage, totalPages);
  return (
    <>
      <PaginationInner totalPages={totalPages} pagination={pagination} maxVisible={maxVisible} />
      <span data-testid="page-display">Page {pagination.page}</span>
    </>
  );
}

describe('Pagination', () => {
  describe('rendering', () => {
    it('renders a navigation landmark labelled "Pagination"', () => {
      render(<ControlledPagination totalPages={5} />);
      expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
    });

    it('renders numbered page buttons', () => {
      render(<ControlledPagination totalPages={5} />);
      expect(screen.getAllByRole('button', { name: /Page \d/ })).toHaveLength(5);
    });

    it('renders prev and next buttons', () => {
      render(<ControlledPagination totalPages={5} />);
      expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Go to next page' })).toBeInTheDocument();
    });

    it('marks the current page with aria-current="page"', () => {
      render(<ControlledPagination initialPage={3} totalPages={5} />);
      expect(screen.getByRole('button', { name: 'Page 3' })).toHaveAttribute(
        'aria-current',
        'page'
      );
    });

    it('does not mark non-current pages with aria-current', () => {
      render(<ControlledPagination initialPage={3} totalPages={5} />);
      expect(screen.getByRole('button', { name: 'Page 1' })).not.toHaveAttribute('aria-current');
      expect(screen.getByRole('button', { name: 'Page 5' })).not.toHaveAttribute('aria-current');
    });
  });

  describe('navigation', () => {
    it('advances to the next page when Next is clicked', async () => {
      render(<ControlledPagination initialPage={2} totalPages={10} />);

      await userEvent.click(screen.getByRole('button', { name: 'Go to next page' }));

      expect(screen.getByTestId('page-display')).toHaveTextContent('Page 3');
      expect(screen.getByRole('button', { name: 'Page 3' })).toHaveAttribute(
        'aria-current',
        'page'
      );
    });

    it('goes back to the previous page when Prev is clicked', async () => {
      render(<ControlledPagination initialPage={4} totalPages={10} />);

      await userEvent.click(screen.getByRole('button', { name: 'Go to previous page' }));

      expect(screen.getByTestId('page-display')).toHaveTextContent('Page 3');
    });

    it('jumps to a specific page when a page button is clicked', async () => {
      render(<ControlledPagination initialPage={1} totalPages={5} />);

      await userEvent.click(screen.getByRole('button', { name: 'Page 3' }));

      expect(screen.getByTestId('page-display')).toHaveTextContent('Page 3');
    });
  });

  describe('boundary behaviour', () => {
    it('disables the Prev button on the first page', () => {
      render(<ControlledPagination initialPage={1} totalPages={5} />);
      expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeDisabled();
    });

    it('disables the Next button on the last page', () => {
      render(<ControlledPagination initialPage={5} totalPages={5} />);
      expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled();
    });

    it('enables both buttons on a middle page', () => {
      render(<ControlledPagination initialPage={3} totalPages={5} />);
      expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Go to next page' })).toBeEnabled();
    });

    it('does not navigate past the first page', async () => {
      render(<ControlledPagination initialPage={1} totalPages={5} />);

      await userEvent.click(screen.getByRole('button', { name: 'Go to previous page' }));

      expect(screen.getByTestId('page-display')).toHaveTextContent('Page 1');
    });

    it('does not navigate past the last page', async () => {
      render(<ControlledPagination initialPage={5} totalPages={5} />);

      await userEvent.click(screen.getByRole('button', { name: 'Go to next page' }));

      expect(screen.getByTestId('page-display')).toHaveTextContent('Page 5');
    });
  });

  describe('ellipsis behaviour', () => {
    it('shows all pages when total is within maxVisible', () => {
      render(<ControlledPagination totalPages={5} maxVisible={7} />);
      expect(screen.getAllByRole('button', { name: /Page \d/ })).toHaveLength(5);
      expect(screen.queryByText('…')).not.toBeInTheDocument();
    });

    it('shows ellipsis when total exceeds maxVisible', () => {
      render(<ControlledPagination initialPage={5} totalPages={20} maxVisible={7} />);
      expect(screen.getAllByText('…').length).toBeGreaterThanOrEqual(1);
    });

    it('shows ellipsis on both sides when far from both ends', () => {
      render(<ControlledPagination initialPage={10} totalPages={20} maxVisible={7} />);
      const ellipses = screen.getAllByText('…');
      expect(ellipses).toHaveLength(2);
    });

    it('always shows the first and last page buttons', () => {
      render(<ControlledPagination initialPage={10} totalPages={20} maxVisible={7} />);
      expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Page 20' })).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('every page button has a unique accessible name', () => {
      render(<ControlledPagination totalPages={10} />);
      const pageButtons = screen.getAllByRole('button', { name: /Page \d/ });
      const names = pageButtons.map((b) => b.getAttribute('aria-label'));
      expect(new Set(names).size).toBe(names.length);
    });

    it('Prev and Next buttons have descriptive labels', () => {
      render(<ControlledPagination totalPages={5} />);
      expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Go to next page' })).toBeInTheDocument();
    });

    it('is keyboard navigable', async () => {
      render(<ControlledPagination initialPage={1} totalPages={5} />);

      // Tab through all buttons to reach the Next button
      // Disabled Prev is skipped by tab
      await userEvent.tab(); // Page 1
      await userEvent.tab(); // Page 2
      await userEvent.tab(); // Page 3
      await userEvent.tab(); // Page 4
      await userEvent.tab(); // Page 5
      await userEvent.tab(); // Next
      expect(screen.getByRole('button', { name: 'Go to next page' })).toHaveFocus();

      // Activate with Enter
      await userEvent.keyboard('{Enter}');
      expect(screen.getByTestId('page-display')).toHaveTextContent('Page 2');
    });
  });

  describe('className passthrough', () => {
    it('applies className to the nav element', () => {
      function Wrapper() {
        const pagination = useMockPagination(1, 5);
        return <PaginationInner totalPages={5} className="my-pagination" pagination={pagination} />;
      }

      render(<Wrapper />);
      expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveClass('my-pagination');
    });
  });

  describe('single page', () => {
    it('renders with a single page, both buttons disabled', () => {
      render(<ControlledPagination totalPages={1} />);
      expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled();
    });
  });
});
