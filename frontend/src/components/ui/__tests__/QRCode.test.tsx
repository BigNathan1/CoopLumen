import { render, screen } from '@testing-library/react';
import { QRCode } from '@/components/ui/QRCode';

const ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

describe('QRCode', () => {
  it('exposes the address through an image role and label', () => {
    render(<QRCode address={ADDRESS} />);

    expect(
      screen.getByRole('img', { name: `Stellar address QR code: ${ADDRESS}` })
    ).toBeInTheDocument();
  });

  it('accepts a custom label', () => {
    render(<QRCode address={ADDRESS} label="Scan to pay" />);

    expect(screen.getByRole('img', { name: `Scan to pay: ${ADDRESS}` })).toBeInTheDocument();
  });

  it('renders the code at the default size', () => {
    const { container } = render(<QRCode address={ADDRESS} />);

    expect(container.querySelector('svg')).toHaveAttribute('height', '192');
  });

  it('renders the code at a custom size', () => {
    const { container } = render(<QRCode address={ADDRESS} size={64} />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('height', '64');
    expect(svg).toHaveAttribute('width', '64');
  });

  it('applies a caller-supplied className to the wrapper', () => {
    const { container } = render(<QRCode address={ADDRESS} className="receive-code" />);

    expect(container.firstChild).toHaveClass('receive-code');
  });
});
