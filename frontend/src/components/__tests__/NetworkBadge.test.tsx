import { render, screen } from '@testing-library/react';

import { NetworkBadge } from '../ui/NetworkBadge';

describe('NetworkBadge', () => {
  it('renders TESTNET with the correct accessible label', () => {
    render(<NetworkBadge network="TESTNET" />);

    expect(screen.getByRole('status')).toHaveTextContent('TESTNET');
    expect(
      screen.getByRole('status', {
        name: 'Stellar network: TESTNET',
      })
    ).toBeInTheDocument();
  });

  it('renders MAINNET with the correct accessible label', () => {
    render(<NetworkBadge network="MAINNET" />);

    expect(screen.getByRole('status')).toHaveTextContent('MAINNET');
    expect(
      screen.getByRole('status', {
        name: 'Stellar network: MAINNET',
      })
    ).toBeInTheDocument();
  });
});
