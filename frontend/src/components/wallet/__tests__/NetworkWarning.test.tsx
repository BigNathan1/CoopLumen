import { render, screen } from '@testing-library/react';
import { NetworkWarning } from '../NetworkWarning';

describe('NetworkWarning', () => {
  it('announces the mismatch through an alert role', () => {
    render(<NetworkWarning currentNetwork="PUBLIC" expectedNetwork="TESTNET" />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('names both the current and expected network', () => {
    render(<NetworkWarning currentNetwork="PUBLIC" expectedNetwork="TESTNET" />);

    expect(screen.getByText('PUBLIC')).toBeInTheDocument();
    expect(screen.getByText('TESTNET')).toBeInTheDocument();
  });

  it('hides the decorative icon from assistive technology', () => {
    const { container } = render(
      <NetworkWarning currentNetwork="PUBLIC" expectedNetwork="TESTNET" />
    );

    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});
