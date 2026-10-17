import { render, screen } from '@testing-library/react';
import { EmptyState } from '@/components/ui/EmptyState';

describe('EmptyState', () => {
  it('renders the message', () => {
    render(<EmptyState message="No items found" />);
    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('renders with a title when provided', () => {
    render(<EmptyState message="No items found" title="Nothing here" />);
    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument();
  });

  it('renders without a title when not provided', () => {
    render(<EmptyState message="No items found" />);
    const headings = screen.queryAllByRole('heading');
    expect(headings).toHaveLength(0);
  });

  it('renders an icon when provided', () => {
    render(<EmptyState message="No items" icon={<span data-testid="test-icon">📦</span>} />);
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('marks the icon container as aria-hidden', () => {
    const { container } = render(
      <EmptyState message="No items" icon={<span>📦</span>} />
    );
    const iconContainer = container.querySelector('.empty-state-icon');
    expect(iconContainer).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders without an icon when not provided', () => {
    const { container } = render(<EmptyState message="No items" />);
    const iconContainer = container.querySelector('.empty-state-icon');
    expect(iconContainer).not.toBeInTheDocument();
  });

  it('renders an action element when provided', () => {
    render(
      <EmptyState
        message="No items"
        action={<button>Add item</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Add item' })).toBeInTheDocument();
  });

  it('renders without an action when not provided', () => {
    const { container } = render(<EmptyState message="No items" />);
    const actionContainer = container.querySelector('.empty-state-action');
    expect(actionContainer).not.toBeInTheDocument();
  });

  describe('accessibility', () => {
    it('renders as a section element', () => {
      const { container } = render(<EmptyState message="No items" />);
      const section = container.querySelector('section');
      expect(section).toBeInTheDocument();
    });

    it('uses the title as the aria-label when provided', () => {
      render(<EmptyState message="No items" title="Empty inbox" />);
      const section = screen.getByLabelText('Empty inbox');
      expect(section).toBeInTheDocument();
    });

    it('uses "Empty state" as the default aria-label', () => {
      render(<EmptyState message="No items" />);
      const section = screen.getByLabelText('Empty state');
      expect(section).toBeInTheDocument();
    });

    it('uses proper heading hierarchy', () => {
      render(<EmptyState message="No items" title="Empty" />);
      const heading = screen.getByRole('heading', { name: 'Empty' });
      expect(heading.tagName).toBe('H2');
    });

    it('renders message in a paragraph', () => {
      const { container } = render(<EmptyState message="No items found" />);
      const message = container.querySelector('.empty-state-message');
      expect(message?.tagName).toBe('P');
      expect(message).toHaveTextContent('No items found');
    });
  });

  describe('styling', () => {
    it('applies the empty-state class', () => {
      const { container } = render(<EmptyState message="No items" />);
      const section = container.querySelector('section');
      expect(section).toHaveClass('empty-state');
    });

    it('applies custom className alongside the default class', () => {
      const { container } = render(<EmptyState message="No items" className="custom-empty" />);
      const section = container.querySelector('section');
      expect(section).toHaveClass('empty-state');
      expect(section).toHaveClass('custom-empty');
    });

    it('applies semantic class names to child elements', () => {
      const { container } = render(
        <EmptyState
          message="No items"
          title="Empty"
          icon={<span>Icon</span>}
          action={<button>Action</button>}
        />
      );

      expect(container.querySelector('.empty-state-icon')).toBeInTheDocument();
      expect(container.querySelector('.empty-state-content')).toBeInTheDocument();
      expect(container.querySelector('.empty-state-title')).toBeInTheDocument();
      expect(container.querySelector('.empty-state-message')).toBeInTheDocument();
      expect(container.querySelector('.empty-state-action')).toBeInTheDocument();
    });
  });

  describe('complete example', () => {
    it('renders all parts together correctly', () => {
      render(
        <EmptyState
          title="No communities yet"
          message="Create your first community to get started"
          icon={<span data-testid="icon">🏘️</span>}
          action={<button>Create community</button>}
          className="communities-empty"
        />
      );

      expect(screen.getByRole('heading', { name: 'No communities yet' })).toBeInTheDocument();
      expect(screen.getByText('Create your first community to get started')).toBeInTheDocument();
      expect(screen.getByTestId('icon')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create community' })).toBeInTheDocument();

      const section = screen.getByLabelText('No communities yet');
      expect(section).toHaveClass('empty-state');
      expect(section).toHaveClass('communities-empty');
    });
  });

  describe('edge cases', () => {
    it('handles empty string message', () => {
      render(<EmptyState message="" />);
      const section = screen.getByLabelText('Empty state');
      expect(section).toBeInTheDocument();
    });

    it('handles very long message text', () => {
      const longMessage = 'A'.repeat(500);
      render(<EmptyState message={longMessage} />);
      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });

    it('handles complex React nodes as icons', () => {
      render(
        <EmptyState
          message="No items"
          icon={
            <div>
              <svg data-testid="svg-icon">
                <circle cx="10" cy="10" r="10" />
              </svg>
            </div>
          }
        />
      );
      expect(screen.getByTestId('svg-icon')).toBeInTheDocument();
    });

    it('handles complex React nodes as actions', () => {
      render(
        <EmptyState
          message="No items"
          action={
            <div>
              <button>Primary</button>
              <button>Secondary</button>
            </div>
          }
        />
      );
      expect(screen.getByRole('button', { name: 'Primary' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Secondary' })).toBeInTheDocument();
    });
  });
});
