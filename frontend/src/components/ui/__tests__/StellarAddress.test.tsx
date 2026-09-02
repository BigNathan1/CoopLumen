import { render, screen } from '@testing-library/react';
import { StellarAddress } from '@/components/ui/StellarAddress';

const ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRST';

describe('StellarAddress', () => {
  it('truncates the address while keeping the full value available', () => {
    render(<StellarAddress address={ADDRESS} />);

    const code = screen.getByTitle(ADDRESS);
    expect(code.textContent).toBe(`${ADDRESS.slice(0, 6)}...${ADDRESS.slice(-6)}`);
  });

  it('honours custom truncation lengths', () => {
    render(<StellarAddress address={ADDRESS} startLength={4} endLength={2} />);

    expect(screen.getByTitle(ADDRESS).textContent).toBe(
      `${ADDRESS.slice(0, 4)}...${ADDRESS.slice(-2)}`
    );
  });

  it('leaves an address shorter than the truncation budget intact', () => {
    render(<StellarAddress address="GSHORT" />);

    expect(screen.getByTitle('GSHORT').textContent).toBe('GSHORT');
  });

  it('links to the mainnet explorer by default', () => {
    render(<StellarAddress address={ADDRESS} />);

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      `https://stellar.expert/explorer/mainnet/account/${ADDRESS}`
    );
  });

  it('links to the testnet explorer when asked', () => {
    render(<StellarAddress address={ADDRESS} network="testnet" />);

    expect(screen.getByRole('link').getAttribute('href')).toContain('/explorer/testnet/account/');
  });

  it('offers a copy control carrying the untruncated address', () => {
    render(<StellarAddress address={ADDRESS} />);

    expect(screen.getByRole('button', { name: 'Copy Stellar address' })).toBeInTheDocument();
  });

  it('announces what the code element holds', () => {
    render(<StellarAddress address={ADDRESS} />);

    expect(screen.getByText('Stellar address:')).toBeInTheDocument();
  });

  it('applies a caller-supplied className to the wrapper', () => {
    const { container } = render(<StellarAddress address={ADDRESS} className="inline-address" />);

    expect(container.firstChild).toHaveClass('inline-address');
  });
});
