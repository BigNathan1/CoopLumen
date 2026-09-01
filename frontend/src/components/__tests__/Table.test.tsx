import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Table, type TableColumn, type SortDirection } from '@/components/ui/Table';

interface TestRow extends Record<string, unknown> {
  name: string;
  email: string;
  role: string;
}

const columns: TableColumn<TestRow>[] = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'email', label: 'Email' },
  { key: 'role', label: 'Role', sortable: true },
];

const rows: TestRow[] = [
  { name: 'Alice', email: 'alice@example.com', role: 'Admin' },
  { name: 'Bob', email: 'bob@example.com', role: 'Member' },
  { name: 'Charlie', email: 'charlie@example.com', role: 'Treasurer' },
];

describe('Table', () => {
  describe('rendering', () => {
    it('renders a table with an accessible label', () => {
      render(<Table columns={columns} data={rows} />);
      expect(screen.getByRole('table', { name: 'Data table' })).toBeInTheDocument();
    });

    it('uses a custom aria-label when provided', () => {
      render(<Table columns={columns} data={rows} ariaLabel="Members list" />);
      expect(screen.getByRole('table', { name: 'Members list' })).toBeInTheDocument();
    });

    it('renders column headers', () => {
      render(<Table columns={columns} data={rows} />);
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Role')).toBeInTheDocument();
    });

    it('renders row data in cells', () => {
      render(<Table columns={columns} data={rows} />);

      const table = screen.getByRole('table');
      const allRows = within(table).getAllByRole('row');

      // Header row + 3 data rows
      expect(allRows).toHaveLength(4);

      // First data row
      const firstRow = allRows[1];
      expect(within(firstRow).getByText('Alice')).toBeInTheDocument();
      expect(within(firstRow).getByText('alice@example.com')).toBeInTheDocument();
      expect(within(firstRow).getByText('Admin')).toBeInTheDocument();
    });

    it('renders all data rows', () => {
      render(<Table columns={columns} data={rows} />);
      const table = screen.getByRole('table');
      const dataRows = within(table).getAllByRole('row').slice(1); // skip header
      expect(dataRows).toHaveLength(3);
    });

    it('uses column className on cells', () => {
      const cols: TableColumn<TestRow>[] = [{ key: 'name', label: 'Name', className: 'name-cell' }];
      render(<Table columns={cols} data={[{ name: 'Alice', email: '', role: '' }]} />);
      expect(screen.getByText('Alice')).toHaveClass('name-cell');
    });

    it('uses column headerClassName on header cells', () => {
      const cols: TableColumn<TestRow>[] = [
        { key: 'name', label: 'Name', headerClassName: 'name-header' },
      ];
      render(<Table columns={cols} data={[{ name: 'Alice', email: '', role: '' }]} />);
      expect(screen.getByText('Name').closest('th')).toHaveClass('name-header');
    });
  });

  describe('custom render functions', () => {
    it('uses render for cell content', () => {
      const cols: TableColumn<TestRow>[] = [
        {
          key: 'name',
          label: 'Name',
          render: (value) => <strong>{String(value)}</strong>,
        },
      ];
      render(<Table columns={cols} data={[{ name: 'Alice', email: '', role: '' }]} />);
      expect(screen.getByText('Alice').tagName).toBe('STRONG');
    });

    it('passes row and index to render', () => {
      const renderFn = jest.fn((value) => String(value));
      const cols: TableColumn<TestRow>[] = [{ key: 'name', label: 'Name', render: renderFn }];
      render(<Table columns={cols} data={[{ name: 'Alice', email: '', role: '' }]} />);
      expect(renderFn).toHaveBeenCalledWith('Alice', { name: 'Alice', email: '', role: '' }, 0);
    });

    it('uses renderHeader for header content', () => {
      const cols: TableColumn<TestRow>[] = [
        {
          key: 'name',
          label: 'Name',
          sortable: true,
          renderHeader: (col) => <em>{col.label}</em>,
        },
      ];
      render(<Table columns={cols} data={[{ name: 'Alice', email: '', role: '' }]} />);
      expect(screen.getByText('Name').tagName).toBe('EM');
    });

    it('handles null/undefined cell values gracefully', () => {
      const cols: TableColumn<Record<string, unknown>>[] = [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ];
      render(<Table columns={cols} data={[{ a: 'yes', b: undefined }]} />);
      expect(screen.getByText('yes')).toBeInTheDocument();
      // undefined cell should render as null (empty)
      const table = screen.getByRole('table');
      const row = within(table).getAllByRole('row')[1];
      const cells = within(row).getAllByRole('cell');
      expect(cells[1]).toBeEmptyDOMElement();
    });
  });

  describe('empty state', () => {
    it('renders the default empty message when data is empty', () => {
      render(<Table columns={columns} data={[]} />);
      expect(screen.getByText('No data to display')).toBeInTheDocument();
    });

    it('uses a custom emptyMessage', () => {
      render(<Table columns={columns} data={[]} emptyMessage="No members yet" />);
      expect(screen.getByText('No members yet')).toBeInTheDocument();
    });

    it('uses custom emptyState over emptyMessage', () => {
      render(
        <Table
          columns={columns}
          data={[]}
          emptyState={<div data-testid="custom">Custom empty</div>}
        />
      );
      expect(screen.getByTestId('custom')).toBeInTheDocument();
      expect(screen.queryByText('No data to display')).not.toBeInTheDocument();
    });

    it('spans the empty cell across all columns', () => {
      render(<Table columns={columns} data={[]} />);
      const emptyCell = screen.getByText('No data to display').closest('td');
      expect(emptyCell).toHaveAttribute('colspan', '3');
    });

    it('does not show the empty state when data is present', () => {
      render(<Table columns={columns} data={rows} />);
      expect(screen.queryByText('No data to display')).not.toBeInTheDocument();
    });
  });

  describe('sortable columns', () => {
    it('renders sort buttons for sortable columns', () => {
      render(<Table columns={columns} data={rows} />);
      expect(screen.getByRole('button', { name: /Sort by Name/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Sort by Role/ })).toBeInTheDocument();
    });

    it('does not render a sort button for non-sortable columns', () => {
      render(<Table columns={columns} data={rows} />);
      // Email is not sortable
      expect(screen.queryByRole('button', { name: /Sort by Email/ })).not.toBeInTheDocument();
    });

    it('sets aria-sort="ascending" on the ascending sorted column', () => {
      render(<Table columns={columns} data={rows} sortKey="name" sortDirection="asc" />);
      const th = screen.getByText('Name').closest('th');
      expect(th).toHaveAttribute('aria-sort', 'ascending');
    });

    it('sets aria-sort="descending" on the descending sorted column', () => {
      render(<Table columns={columns} data={rows} sortKey="name" sortDirection="desc" />);
      const th = screen.getByText('Name').closest('th');
      expect(th).toHaveAttribute('aria-sort', 'descending');
    });

    it('sets aria-sort="none" on sortable columns that are not active', () => {
      render(<Table columns={columns} data={rows} sortKey="name" sortDirection="asc" />);
      const th = screen.getByText('Role').closest('th');
      expect(th).toHaveAttribute('aria-sort', 'none');
    });

    it('omits aria-sort on non-sortable columns', () => {
      render(<Table columns={columns} data={rows} />);
      const th = screen.getByText('Email').closest('th');
      expect(th).not.toHaveAttribute('aria-sort');
    });

    it('calls onSort when a sort button is clicked', async () => {
      const onSort = jest.fn();
      render(<Table columns={columns} data={rows} onSort={onSort} />);

      await userEvent.click(screen.getByRole('button', { name: /Sort by Name/ }));

      expect(onSort).toHaveBeenCalledWith('name');
    });

    it('calls onSort with the correct key for different columns', async () => {
      const onSort = jest.fn();
      render(<Table columns={columns} data={rows} onSort={onSort} />);

      await userEvent.click(screen.getByRole('button', { name: /Sort by Role/ }));

      expect(onSort).toHaveBeenCalledWith('role');
    });

    it('sets data-sortable on sortable column headers', () => {
      render(<Table columns={columns} data={rows} />);
      const th = screen.getByText('Name').closest('th');
      expect(th).toHaveAttribute('data-sortable', 'true');
    });

    it('sets data-sort-key on sortable column headers', () => {
      render(<Table columns={columns} data={rows} />);
      const th = screen.getByText('Name').closest('th');
      expect(th).toHaveAttribute('data-sort-key', 'name');
    });

    it('sets data-active on the currently sorted column', () => {
      render(<Table columns={columns} data={rows} sortKey="name" sortDirection="asc" />);
      const th = screen.getByText('Name').closest('th');
      expect(th).toHaveAttribute('data-active', 'true');
    });

    it('does not set data-active on unsorted columns', () => {
      render(<Table columns={columns} data={rows} sortKey="name" sortDirection="asc" />);
      const th = screen.getByText('Role').closest('th');
      expect(th).not.toHaveAttribute('data-active');
    });

    it('sort button includes direction in aria-label', () => {
      render(<Table columns={columns} data={rows} sortKey="name" sortDirection="asc" />);
      expect(
        screen.getByRole('button', { name: /Sort by Name, currently ascending/ })
      ).toBeInTheDocument();
    });
  });

  describe('compact mode', () => {
    it('sets data-compact on the table when compact is true', () => {
      render(<Table columns={columns} data={rows} compact />);
      expect(screen.getByRole('table')).toHaveAttribute('data-compact', 'true');
    });

    it('does not set data-compact when compact is false', () => {
      render(<Table columns={columns} data={rows} />);
      expect(screen.getByRole('table')).not.toHaveAttribute('data-compact');
    });
  });

  describe('className passthrough', () => {
    it('applies className to the wrapper div', () => {
      render(<Table columns={columns} data={rows} className="my-table" />);
      expect(screen.getByRole('table').parentElement).toHaveClass('my-table');
    });
  });

  describe('keyboard accessibility', () => {
    it('sort buttons are focusable and activatable with Enter', async () => {
      const onSort = jest.fn();
      render(<Table columns={columns} data={rows} onSort={onSort} />);

      const sortButton = screen.getByRole('button', { name: /Sort by Name/ });
      sortButton.focus();
      await userEvent.keyboard('{Enter}');

      expect(onSort).toHaveBeenCalledWith('name');
    });

    it('sort buttons are activatable with Space', async () => {
      const onSort = jest.fn();
      render(<Table columns={columns} data={rows} onSort={onSort} />);

      const sortButton = screen.getByRole('button', { name: /Sort by Name/ });
      sortButton.focus();
      await userEvent.keyboard(' ');

      expect(onSort).toHaveBeenCalledWith('name');
    });
  });

  describe('edge cases', () => {
    it('renders with a single column', () => {
      const cols: TableColumn<TestRow>[] = [{ key: 'name', label: 'Name' }];
      render(<Table columns={cols} data={[{ name: 'Alice', email: '', role: '' }]} />);
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('renders with a single row', () => {
      render(<Table columns={columns} data={[rows[0]]} />);
      const table = screen.getByRole('table');
      expect(within(table).getAllByRole('row')).toHaveLength(2); // header + 1 data
    });

    it('renders with no sortable columns', () => {
      const cols: TableColumn<TestRow>[] = [
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
      ];
      render(<Table columns={cols} data={rows} />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('handles all columns being sortable', () => {
      const cols: TableColumn<TestRow>[] = [
        { key: 'name', label: 'Name', sortable: true },
        { key: 'email', label: 'Email', sortable: true },
      ];
      render(<Table columns={cols} data={rows} />);
      expect(screen.getAllByRole('button')).toHaveLength(2);
    });

    it('sort direction indicator shows default when no sort is active', () => {
      render(<Table columns={columns} data={rows} />);
      // The sort icon for an unsorted column shows ⇅ (default)
      const sortButtons = screen.getAllByRole('button');
      const nameButton = sortButtons[0];
      expect(nameButton).toHaveTextContent('⇅');
    });

    it('sort direction indicator shows ▲ for ascending', () => {
      render(<Table columns={columns} data={rows} sortKey="name" sortDirection="asc" />);
      expect(screen.getByText('▲')).toBeInTheDocument();
    });

    it('sort direction indicator shows ▼ for descending', () => {
      render(<Table columns={columns} data={rows} sortKey="name" sortDirection="desc" />);
      expect(screen.getByText('▼')).toBeInTheDocument();
    });
  });
});
