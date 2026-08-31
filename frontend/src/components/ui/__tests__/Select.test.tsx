import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select, type SelectOption } from '@/components/ui/Select';

const roles: SelectOption[] = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
  { value: 'treasurer', label: 'Treasurer' },
];

const withDisabled: SelectOption[] = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin', disabled: true },
  { value: 'treasurer', label: 'Treasurer' },
];

function getTrigger() {
  return screen.getByRole('combobox', { name: /Member role/ });
}

function ControlledSelect() {
  const [value, setValue] = useState('member');
  return (
    <>
      <Select label="Member role" options={roles} value={value} onChange={setValue} />
      <span data-testid="value">{value}</span>
    </>
  );
}

describe('Select', () => {
  it('renders a combobox labelled by the visible label', () => {
    render(<Select label="Member role" options={roles} />);

    const trigger = getTrigger();
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the placeholder until something is selected', () => {
    render(<Select label="Member role" options={roles} placeholder="Choose a role" />);
    expect(getTrigger()).toHaveTextContent('Choose a role');
  });

  it('shows the label of the default value', () => {
    render(<Select label="Member role" options={roles} defaultValue="treasurer" />);
    expect(getTrigger()).toHaveTextContent('Treasurer');
  });

  it('keeps the list out of the accessibility tree while closed', () => {
    render(<Select label="Member role" options={roles} />);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens on click and closes on a second click', async () => {
    render(<Select label="Member role" options={roles} />);

    await userEvent.click(getTrigger());
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(getTrigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('option')).toHaveLength(3);

    await userEvent.click(getTrigger());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('selects an option with the pointer and reports the value', async () => {
    const onChange = jest.fn();
    render(<Select label="Member role" options={roles} onChange={onChange} />);

    await userEvent.click(getTrigger());
    await userEvent.click(screen.getByRole('option', { name: 'Admin' }));

    expect(onChange).toHaveBeenCalledWith('admin');
    expect(getTrigger()).toHaveTextContent('Admin');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('marks the selected option with aria-selected', async () => {
    render(<Select label="Member role" options={roles} defaultValue="admin" />);

    await userEvent.click(getTrigger());

    expect(screen.getByRole('option', { name: 'Admin' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Member' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  it('is reachable by keyboard and opens with Enter', async () => {
    render(<Select label="Member role" options={roles} />);

    await userEvent.tab();
    expect(getTrigger()).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it.each(['{ArrowDown}', '{ArrowUp}', ' '])('opens with %s', async (key) => {
    render(<Select label="Member role" options={roles} />);

    await userEvent.tab();
    await userEvent.keyboard(key);

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('keeps focus on the trigger and tracks the active option with aria-activedescendant', async () => {
    render(<Select label="Member role" options={roles} />);

    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');

    const trigger = getTrigger();
    expect(trigger).toHaveFocus();

    const first = screen.getByRole('option', { name: 'Member' });
    expect(trigger).toHaveAttribute('aria-activedescendant', first.id);

    await userEvent.keyboard('{ArrowDown}');
    expect(trigger).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Admin' }).id
    );

    await userEvent.keyboard('{ArrowUp}');
    expect(trigger).toHaveAttribute('aria-activedescendant', first.id);
  });

  it('opens with the current selection active', async () => {
    render(<Select label="Member role" options={roles} defaultValue="treasurer" />);

    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');

    expect(getTrigger()).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Treasurer' }).id
    );
  });

  it('does not move past either end of the list', async () => {
    render(<Select label="Member role" options={roles} />);

    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}{ArrowUp}{ArrowUp}');
    expect(getTrigger()).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Member' }).id
    );

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(getTrigger()).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Treasurer' }).id
    );
  });

  it('jumps to the ends with Home and End', async () => {
    render(<Select label="Member role" options={roles} />);

    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}{End}');
    expect(getTrigger()).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Treasurer' }).id
    );

    await userEvent.keyboard('{Home}');
    expect(getTrigger()).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Member' }).id
    );
  });

  it('commits the active option with Enter', async () => {
    const onChange = jest.fn();
    render(<Select label="Member role" options={roles} onChange={onChange} />);

    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('admin');
    expect(getTrigger()).toHaveTextContent('Admin');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('commits the active option with Space', async () => {
    const onChange = jest.fn();
    render(<Select label="Member role" options={roles} onChange={onChange} />);

    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}{ArrowDown} ');

    expect(onChange).toHaveBeenCalledWith('admin');
  });

  it('closes on Escape without changing the selection', async () => {
    const onChange = jest.fn();
    render(<Select label="Member role" options={roles} onChange={onChange} />);

    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(getTrigger()).toHaveFocus();
  });

  it('closes when focus tabs away', async () => {
    render(
      <>
        <Select label="Member role" options={roles} />
        <button type="button">After</button>
      </>
    );

    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await userEvent.tab();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  it('closes when a pointer press lands outside', async () => {
    render(
      <>
        <Select label="Member role" options={roles} />
        <p>Elsewhere</p>
      </>
    );

    await userEvent.click(getTrigger());
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Elsewhere'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('jumps to a matching option while open when the user types', async () => {
    render(<Select label="Member role" options={roles} />);

    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}t');

    expect(getTrigger()).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'Treasurer' }).id
    );
  });

  it('selects a matching option while closed when the user types', async () => {
    const onChange = jest.fn();
    render(<Select label="Member role" options={roles} onChange={onChange} />);

    await userEvent.tab();
    await userEvent.keyboard('a');

    expect(onChange).toHaveBeenCalledWith('admin');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('skips disabled options with the keyboard', async () => {
    const onChange = jest.fn();
    render(<Select label="Member role" options={withDisabled} onChange={onChange} />);

    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('treasurer');
  });

  it('does not select a disabled option on click', async () => {
    const onChange = jest.fn();
    render(<Select label="Member role" options={withDisabled} onChange={onChange} />);

    await userEvent.click(getTrigger());
    await userEvent.click(screen.getByRole('option', { name: 'Admin' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('exposes disabled options through aria-disabled', async () => {
    render(<Select label="Member role" options={withDisabled} />);

    await userEvent.click(getTrigger());
    expect(screen.getByRole('option', { name: 'Admin' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('does not open while disabled', async () => {
    render(<Select label="Member role" options={roles} disabled />);

    const trigger = getTrigger();
    expect(trigger).toBeDisabled();

    await userEvent.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('follows the controlled value', async () => {
    render(<ControlledSelect />);

    expect(getTrigger()).toHaveTextContent('Member');

    await userEvent.click(getTrigger());
    await userEvent.click(screen.getByRole('option', { name: 'Treasurer' }));

    expect(screen.getByTestId('value')).toHaveTextContent('treasurer');
    expect(getTrigger()).toHaveTextContent('Treasurer');
  });

  it('describes the trigger with helper text', () => {
    render(<Select label="Member role" options={roles} helperText="Admins can invite members" />);

    expect(getTrigger()).toHaveAccessibleDescription('Admins can invite members');
  });

  it('announces the error and marks the trigger invalid', () => {
    render(<Select label="Member role" options={roles} error="Pick a role" />);

    expect(getTrigger()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a role');
  });

  it('marks the trigger invalid without a message when error is true', () => {
    render(<Select label="Member role" options={roles} error />);

    expect(getTrigger()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sets aria-required when required', () => {
    render(<Select label="Member role" options={roles} required />);
    expect(getTrigger()).toHaveAttribute('aria-required', 'true');
  });

  it('mirrors the value into a hidden input when named', async () => {
    const { container } = render(<Select label="Member role" options={roles} name="role" />);

    const hidden = () => container.querySelector<HTMLInputElement>('input[name="role"]');
    expect(hidden()).toHaveValue('');

    await userEvent.click(getTrigger());
    await userEvent.click(screen.getByRole('option', { name: 'Admin' }));

    expect(hidden()).toHaveValue('admin');
  });

  it('gives each instance its own ids', () => {
    render(
      <>
        <Select label="First role" options={roles} />
        <Select label="Second role" options={roles} />
      </>
    );

    const [first, second] = screen.getAllByRole('combobox');
    expect(first.id).toBeTruthy();
    expect(first.id).not.toBe(second.id);
  });

  it('focuses the trigger when the label is clicked', async () => {
    render(<Select label="Member role" options={roles} />);

    await userEvent.click(screen.getByText('Member role'));
    expect(getTrigger()).toHaveFocus();
  });
});
