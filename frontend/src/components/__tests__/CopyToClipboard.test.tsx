import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CopyToClipboard } from '../ui/CopyToClipboard';

describe('CopyToClipboard', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('copies the supplied value and shows visual feedback', async () => {
    const user = userEvent.setup();

    render(<CopyToClipboard value="GABC123" />);

    await user.click(
      screen.getByRole('button', { name: 'Copy to clipboard' }),
    );

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('GABC123');

    expect(
      screen.getByRole('button', { name: 'Copied' }),
    ).toBeInTheDocument();
  });

  it('restores the default label after the feedback period', async () => {
    jest.useFakeTimers();

    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });

    render(<CopyToClipboard value="GABC123" />);

    await user.click(
      screen.getByRole('button', { name: 'Copy to clipboard' }),
    );

    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();

    jest.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Copy to clipboard' }),
      ).toBeInTheDocument();
    });

    jest.useRealTimers();
  });
});
