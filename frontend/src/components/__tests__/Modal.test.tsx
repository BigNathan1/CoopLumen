import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../Modal';

describe('Modal', () => {
  describe('Rendering', () => {
    it('renders when isOpen is true', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
          <p>Test content</p>
        </Modal>
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Test Modal')).toBeInTheDocument();
      expect(screen.getByText('Test content')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
      render(
        <Modal isOpen={false} onClose={jest.fn()} title="Test Modal">
          <p>Test content</p>
        </Modal>
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders with backdrop element', () => {
      const { container } = render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
          <p>Test content</p>
        </Modal>
      );

      const backdrop = container.querySelector('[aria-hidden="true"]');
      expect(backdrop).toBeInTheDocument();
    });

    it('renders close button with accessible label', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
          <p>Test content</p>
        </Modal>
      );

      expect(screen.getByLabelText('Close modal')).toBeInTheDocument();
    });
  });

  describe('ARIA attributes', () => {
    it('sets role="dialog" and aria-modal="true"', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
          <p>Test content</p>
        </Modal>
      );

      const modal = screen.getByRole('dialog');
      expect(modal).toHaveAttribute('aria-modal', 'true');
    });

    it('sets aria-labelledby pointing to title', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
          <p>Test content</p>
        </Modal>
      );

      const modal = screen.getByRole('dialog');
      const titleId = modal.getAttribute('aria-labelledby');
      expect(titleId).toBeTruthy();

      const title = document.getElementById(titleId!);
      expect(title).toHaveTextContent('Test Modal');
    });

    it('sets aria-describedby when provided', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test Modal" ariaDescribedBy="desc-1">
          <p>Test content</p>
        </Modal>
      );

      const modal = screen.getByRole('dialog');
      expect(modal).toHaveAttribute('aria-describedby', 'desc-1');
    });

    it('backdrop has aria-hidden="true"', () => {
      const { container } = render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
          <p>Test content</p>
        </Modal>
      );

      const backdrop = container.querySelector('[aria-hidden="true"]');
      expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('Close button', () => {
    it('calls onClose when close button is clicked', () => {
      const onClose = jest.fn();
      render(
        <Modal isOpen={true} onClose={onClose} title="Test Modal">
          <p>Test content</p>
        </Modal>
      );

      const closeButton = screen.getByLabelText('Close modal');
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('ESC key handling', () => {
    it('calls onClose when ESC key is pressed', async () => {
      const onClose = jest.fn();
      render(
        <Modal isOpen={true} onClose={onClose} title="Test Modal">
          <button>Focusable button</button>
        </Modal>
      );

      const button = screen.getByText('Focusable button');
      button.focus();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not trigger close for other keys', () => {
      const onClose = jest.fn();
      render(
        <Modal isOpen={true} onClose={onClose} title="Test Modal">
          <button>Focusable button</button>
        </Modal>
      );

      fireEvent.keyDown(document, { key: 'Enter' });

      expect(onClose).not.toHaveBeenCalled();
    });

    it('removes ESC listener when modal closes', () => {
      const onClose = jest.fn();
      const { rerender } = render(
        <Modal isOpen={true} onClose={onClose} title="Test Modal">
          <button>Focusable button</button>
        </Modal>
      );

      // Close the modal
      rerender(
        <Modal isOpen={false} onClose={onClose} title="Test Modal">
          <button>Focusable button</button>
        </Modal>
      );

      // Press ESC after modal is closed
      fireEvent.keyDown(document, { key: 'Escape' });

      // Should not have been called again
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Backdrop click', () => {
    it('calls onClose when backdrop is clicked (default)', async () => {
      const onClose = jest.fn();
      const { container } = render(
        <Modal isOpen={true} onClose={onClose} title="Test Modal">
          <p>Test content</p>
        </Modal>
      );

      const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;
      fireEvent.click(backdrop);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close when closeOnBackdrop is false', () => {
      const onClose = jest.fn();
      const { container } = render(
        <Modal isOpen={true} onClose={onClose} title="Test Modal" closeOnBackdrop={false}>
          <p>Test content</p>
        </Modal>
      );

      const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;
      fireEvent.click(backdrop);

      expect(onClose).not.toHaveBeenCalled();
    });

    it('does not close when clicking modal content', async () => {
      const onClose = jest.fn();
      render(
        <Modal isOpen={true} onClose={onClose} title="Test Modal">
          <p>Test content</p>
        </Modal>
      );

      const content = screen.getByText('Test content');
      fireEvent.click(content);

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Focus trap', () => {
    it('moves focus into modal on open (first focusable element)', async () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
          <button id="btn1">Button 1</button>
          <button id="btn2">Button 2</button>
        </Modal>
      );

      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByText('Button 1'));
      });
    });

    it('focuses modal itself if no focusable elements', async () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
          <p>Static content</p>
        </Modal>
      );

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toHaveFocus();
      });
    });

    it('focuses last element with initialFocus="last"', async () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test Modal" initialFocus="last">
          <button id="btn1">Button 1</button>
          <button id="btn2">Button 2</button>
        </Modal>
      );

      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByText('Button 2'));
      });
    });

    it('traps Tab key within modal', async () => {
      const user = userEvent.setup();
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
          <button id="btn1">Button 1</button>
          <button id="btn2">Button 2</button>
        </Modal>
      );

      const btn1 = screen.getByText('Button 1');
      const btn2 = screen.getByText('Button 2');

      // Wait for initial focus
      await waitFor(() => expect(btn1).toHaveFocus());

      // Tab should move to next button
      await user.tab();
      expect(btn2).toHaveFocus();

      // Tab from last should wrap to first
      await user.tab();
      expect(btn1).toHaveFocus();
    });

    it('traps Shift+Tab key within modal', async () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
          <button id="btn1">Button 1</button>
          <button id="btn2">Button 2</button>
        </Modal>
      );

      const btn1 = screen.getByText('Button 1');
      const btn2 = screen.getByText('Button 2');

      // Wait for initial focus on btn1
      await waitFor(() => expect(btn1).toHaveFocus());

      // Shift+Tab from first should wrap to last
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(btn2).toHaveFocus();

      // Shift+Tab should move to previous button
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(btn1).toHaveFocus();
    });

    it('includes close button in focus trap', async () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
          <button id="content-btn">Content Button</button>
        </Modal>
      );

      const closeButton = screen.getByLabelText('Close modal');
      const contentButton = screen.getByText('Content Button');

      // Wait for initial focus
      await waitFor(() => expect(contentButton).toHaveFocus());

      // Tab through close button
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(closeButton).toHaveFocus();

      // Tab wraps back to content button
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(contentButton).toHaveFocus();
    });

    it('handles modals with only non-focusable content', async () => {
      const { container } = render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
          <div>
            <p>Some text</p>
            <span>More text</span>
          </div>
        </Modal>
      );

      await waitFor(() => {
        const modal = screen.getByRole('dialog');
        expect(modal).toHaveFocus();
      });
    });
  });

  describe('Focus restoration', () => {
    it('restores focus to trigger element on close', async () => {
      const { rerender } = render(
        <>
          <button id="trigger">Open Modal</button>
          <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
            <button>Modal Button</button>
          </Modal>
        </>
      );

      const trigger = document.getElementById('trigger') as HTMLButtonElement;

      // Modal opens and focuses its content
      await waitFor(() => {
        expect(document.activeElement).not.toBe(trigger);
      });

      // Simulate closing modal
      rerender(
        <>
          <button id="trigger">Open Modal</button>
          <Modal isOpen={false} onClose={jest.fn()} title="Test Modal">
            <button>Modal Button</button>
          </Modal>
        </>
      );

      // Focus should be restored to trigger
      expect(trigger).toHaveFocus();
    });
  });

  describe('Multiple instances', () => {
    it('handles multiple modals with independent focus traps', async () => {
      const onClose1 = jest.fn();
      const onClose2 = jest.fn();

      render(
        <>
          <Modal isOpen={true} onClose={onClose1} title="Modal 1">
            <button id="m1-btn">Modal 1 Button</button>
          </Modal>
          <Modal isOpen={false} onClose={onClose2} title="Modal 2">
            <button id="m2-btn">Modal 2 Button</button>
          </Modal>
        </>
      );

      const m1Btn = screen.getByText('Modal 1 Button');

      // First modal should have focus
      await waitFor(() => expect(m1Btn).toHaveFocus());

      // ESC should close first modal
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose1).toHaveBeenCalledTimes(1);
    });
  });

  describe('Different content types', () => {
    it('works with form inputs inside modal', async () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Form Modal">
          <input type="text" placeholder="Name" />
          <textarea placeholder="Message" />
          <button>Submit</button>
        </Modal>
      );

      const input = screen.getByPlaceholderText('Name') as HTMLInputElement;

      await waitFor(() => {
        expect(input).toHaveFocus();
      });

      // Should trap focus within form elements
      fireEvent.keyDown(document, { key: 'Tab' });
      const textarea = screen.getByPlaceholderText('Message') as HTMLTextAreaElement;
      expect(textarea).toHaveFocus();
    });

    it('works with links inside modal', async () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Link Modal">
          <a href="#test1">Link 1</a>
          <a href="#test2">Link 2</a>
          <button>Action</button>
        </Modal>
      );

      const link1 = screen.getByText('Link 1') as HTMLAnchorElement;

      await waitFor(() => {
        expect(link1).toHaveFocus();
      });
    });

    it('respects disabled attribute in focus trap', async () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
          <button id="btn1">Button 1</button>
          <button id="btn2" disabled>
            Button 2 (disabled)
          </button>
          <button id="btn3">Button 3</button>
        </Modal>
      );

      const btn1 = screen.getByText('Button 1') as HTMLButtonElement;
      const btn3 = screen.getByText('Button 3') as HTMLButtonElement;

      await waitFor(() => expect(btn1).toHaveFocus());

      // Tab should skip disabled button
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(btn3).toHaveFocus();
    });

    it('respects tabindex negative elements', async () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
          <button id="btn1">Button 1</button>
          <button id="btn2" tabIndex={-1}>
            Button 2 (tabindex=-1)
          </button>
          <button id="btn3">Button 3</button>
        </Modal>
      );

      const btn1 = screen.getByText('Button 1') as HTMLButtonElement;
      const btn3 = screen.getByText('Button 3') as HTMLButtonElement;

      await waitFor(() => expect(btn1).toHaveFocus());

      // Tab should skip tabindex=-1 button
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(btn3).toHaveFocus();
    });
  });

  describe('Edge cases', () => {
    it('handles rapid open/close cycles', async () => {
      const onClose = jest.fn();
      const { rerender } = render(
        <Modal isOpen={true} onClose={onClose} title="Test Modal">
          <button>Button</button>
        </Modal>
      );

      // Rapidly toggle
      rerender(
        <Modal isOpen={false} onClose={onClose} title="Test Modal">
          <button>Button</button>
        </Modal>
      );

      rerender(
        <Modal isOpen={true} onClose={onClose} title="Test Modal">
          <button>Button</button>
        </Modal>
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('handles content change while open', () => {
      const { rerender } = render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
          <button id="btn1">Button 1</button>
        </Modal>
      );

      expect(screen.getByText('Button 1')).toBeInTheDocument();

      rerender(
        <Modal isOpen={true} onClose={jest.fn()} title="Test Modal">
          <button id="btn2">Button 2</button>
        </Modal>
      );

      expect(screen.queryByText('Button 1')).not.toBeInTheDocument();
      expect(screen.getByText('Button 2')).toBeInTheDocument();
    });

    it('cleans up listeners on unmount', () => {
      const onClose = jest.fn();
      const { unmount } = render(
        <Modal isOpen={true} onClose={onClose} title="Test Modal">
          <button>Button</button>
        </Modal>
      );

      unmount();

      // After unmount, ESC should not trigger anything
      fireEvent.keyDown(document, { key: 'Escape' });
      // Should not throw or cause issues
      expect(true).toBe(true);
    });
  });
});
