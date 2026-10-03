import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from '@/components/ui/Tooltip';

describe('Tooltip', () => {
  it('renders the trigger without showing the tooltip initially', () => {
    render(
      <Tooltip content="Members can invite others once trusted">
        <button type="button">Info</button>
      </Tooltip>
    );

    expect(screen.getByRole('button', { name: 'Info' })).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows the tooltip on hover and hides when the pointer leaves', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Helpful tip">
        <button type="button">Hover me</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Hover me' });
    await user.hover(trigger);
    expect(screen.getByRole('tooltip', { name: 'Helpful tip' })).toBeInTheDocument();

    await user.unhover(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows the tooltip on focus and hides on blur', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Focused help">
        <button type="button">Trigger</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Trigger' });
    await user.tab();
    expect(trigger).toHaveFocus();
    expect(screen.getByRole('tooltip', { name: 'Focused help' })).toBeInTheDocument();

    await user.tab();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('links the trigger with aria-describedby while open', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Extra info">
        <button type="button">More</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button', { name: 'More' });
    expect(trigger).not.toHaveAttribute('aria-describedby');

    await user.hover(trigger);
    const tooltip = screen.getByRole('tooltip');
    expect(trigger).toHaveAttribute('aria-describedby', tooltip.id);
    expect(tooltip).toHaveAttribute('id', expect.any(String));
  });

  it('preserves an existing aria-describedby alongside the tooltip id', async () => {
    const user = userEvent.setup();
    render(
      <>
        <p id="external">External description</p>
        <Tooltip content="Tooltip text">
          <button type="button" aria-describedby="external">
            Action
          </button>
        </Tooltip>
      </>
    );

    const trigger = screen.getByRole('button', { name: 'Action' });
    await user.hover(trigger);

    const describedBy = trigger.getAttribute('aria-describedby') ?? '';
    expect(describedBy).toContain('external');
    const tooltip = screen.getByRole('tooltip');
    expect(describedBy).toContain(tooltip.id);
  });

  it('dismisses the tooltip on Escape without moving focus', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Escapable">
        <button type="button">Trigger</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Trigger' });
    await user.tab();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('is reachable by keyboard – tab lands on the trigger', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Keyboard help">
        <button type="button">First</button>
      </Tooltip>
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('uses the provided id for the tooltip', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Custom id tip" id="custom-tooltip">
        <button type="button">Btn</button>
      </Tooltip>
    );

    await user.hover(screen.getByRole('button', { name: 'Btn' }));
    expect(screen.getByRole('tooltip')).toHaveAttribute('id', 'custom-tooltip');
    expect(screen.getByRole('button', { name: 'Btn' })).toHaveAttribute(
      'aria-describedby',
      'custom-tooltip'
    );
  });

  it('applies the placement attribute to the tooltip', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Placed" placement="bottom">
        <button type="button">Btn</button>
      </Tooltip>
    );

    await user.hover(screen.getByRole('button', { name: 'Btn' }));
    expect(screen.getByRole('tooltip')).toHaveAttribute('data-placement', 'bottom');
  });

  it('defaults placement to top', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Default place">
        <button type="button">Btn</button>
      </Tooltip>
    );

    await user.hover(screen.getByRole('button', { name: 'Btn' }));
    expect(screen.getByRole('tooltip')).toHaveAttribute('data-placement', 'top');
  });

  it('supports all placements', async () => {
    const user = userEvent.setup();
    for (const placement of ['top', 'bottom', 'left', 'right'] as const) {
      const { unmount } = render(
        <Tooltip content="tip" placement={placement}>
          <button type="button">Btn</button>
        </Tooltip>
      );
      await user.hover(screen.getByRole('button', { name: 'Btn' }));
      expect(screen.getByRole('tooltip')).toHaveAttribute('data-placement', placement);
      unmount();
    }
  });

  it('applies className to the wrapper and contentClassName to the bubble', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Tooltip content="Styled" className="wrapper-class" contentClassName="bubble-class">
        <button type="button">Btn</button>
      </Tooltip>
    );

    expect(container.firstChild).toHaveClass('wrapper-class');
    await user.hover(screen.getByRole('button', { name: 'Btn' }));
    expect(screen.getByRole('tooltip')).toHaveClass('bubble-class');
  });

  it('wraps non-element children in a focusable trigger', async () => {
    const user = userEvent.setup();
    render(<Tooltip content="Plain text tip">Hover text</Tooltip>);

    // The fallback trigger is focusable and announces the tooltip
    await user.tab();
    expect(screen.getByRole('tooltip', { name: 'Plain text tip' })).toBeInTheDocument();
  });

  it('does not render an empty tooltip when content is empty', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="">
        <button type="button">Btn</button>
      </Tooltip>
    );

    await user.hover(screen.getByRole('button', { name: 'Btn' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('does not render when content is null', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content={null}>
        <button type="button">Btn</button>
      </Tooltip>
    );

    await user.hover(screen.getByRole('button', { name: 'Btn' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('renders rich content inside the tooltip', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content={<span data-testid="rich">Rich content</span>}>
        <button type="button">Btn</button>
      </Tooltip>
    );

    await user.hover(screen.getByRole('button', { name: 'Btn' }));
    expect(screen.getByTestId('rich')).toBeInTheDocument();
  });

  it('forwards focus, blur, mouse and key handlers from the cloned trigger', async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    const onMouseEnter = jest.fn();
    const onMouseLeave = jest.fn();
    const user = userEvent.setup();

    render(
      <Tooltip content="tip">
        <button
          type="button"
          onFocus={onFocus}
          onBlur={onBlur}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          Btn
        </button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Btn' });
    await user.hover(trigger);
    expect(onMouseEnter).toHaveBeenCalled();

    await user.unhover(trigger);
    expect(onMouseLeave).toHaveBeenCalled();

    await user.tab();
    expect(onFocus).toHaveBeenCalled();

    await user.tab();
    expect(onBlur).toHaveBeenCalled();
  });

  it('gives each instance its own tooltip id', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Tooltip content="First tip">
          <button type="button">First</button>
        </Tooltip>
        <Tooltip content="Second tip">
          <button type="button">Second</button>
        </Tooltip>
      </>
    );

    await user.hover(screen.getByRole('button', { name: 'First' }));
    const firstId = screen.getByRole('tooltip').id;
    await user.unhover(screen.getByRole('button', { name: 'First' }));

    await user.hover(screen.getByRole('button', { name: 'Second' }));
    const secondId = screen.getByRole('tooltip').id;

    expect(firstId).not.toBe(secondId);
  });
});
