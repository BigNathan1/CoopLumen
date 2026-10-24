import { render, screen } from '@testing-library/react';
import { TokenCard } from '@/components/tokens/TokenCard';
import type { Token } from '@/hooks/useTokens';

const ISSUER = 'G' + 'A'.repeat(55);
const DISTRIBUTOR = 'G' + 'B'.repeat(55);

const baseToken: Token = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  community_id: '456e7890-e89b-12d3-a456-426614174001',
  asset_code: 'COOP',
  asset_issuer: ISSUER,
  distributor_address: DISTRIBUTOR,
  total_supply: '1000000',
  name: 'Community Coop Token',
  description: 'A token for our community',
  decimals: 2,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('TokenCard', () => {
  it('renders the asset code prominently', () => {
    render(<TokenCard token={baseToken} />);
    expect(screen.getByText('COOP')).toBeInTheDocument();
  });

  it('renders the token name when provided', () => {
    render(<TokenCard token={baseToken} />);
    expect(screen.getByText('Community Coop Token')).toBeInTheDocument();
  });

  it('omits the name when not provided', () => {
    const tokenWithoutName = { ...baseToken, name: null };
    render(<TokenCard token={tokenWithoutName} />);
    expect(screen.queryByText('Community Coop Token')).not.toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(<TokenCard token={baseToken} />);
    expect(screen.getByText('A token for our community')).toBeInTheDocument();
  });

  it('omits the description when not provided', () => {
    const tokenWithoutDescription = { ...baseToken, description: null };
    render(<TokenCard token={tokenWithoutDescription} />);
    expect(screen.queryByText('A token for our community')).not.toBeInTheDocument();
  });

  describe('supply formatting', () => {
    it('formats total supply with thousand separators', () => {
      render(<TokenCard token={baseToken} />);
      expect(screen.getByText('1,000,000')).toBeInTheDocument();
    });

    it('formats supply with the specified decimal places', () => {
      const tokenWithDecimals = { ...baseToken, total_supply: '1234.56789', decimals: 3 };
      render(<TokenCard token={tokenWithDecimals} />);
      expect(screen.getByText('1,234.568')).toBeInTheDocument();
    });

    it('formats supply with up to 7 decimals when decimals is null', () => {
      const tokenWithNullDecimals = { ...baseToken, total_supply: '123.12345678', decimals: null };
      render(<TokenCard token={tokenWithNullDecimals} />);
      // Should truncate to 7 decimal places
      expect(screen.getByText('123.1234568')).toBeInTheDocument();
    });

    it('handles whole numbers without unnecessary decimals', () => {
      const wholeNumberToken = { ...baseToken, total_supply: '5000', decimals: 2 };
      render(<TokenCard token={wholeNumberToken} />);
      expect(screen.getByText('5,000')).toBeInTheDocument();
    });

    it('renders supply as-is when it cannot be parsed as a number', () => {
      const invalidSupplyToken = { ...baseToken, total_supply: 'invalid' };
      render(<TokenCard token={invalidSupplyToken} />);
      expect(screen.getByText('invalid')).toBeInTheDocument();
    });
  });

  describe('address display', () => {
    it('shortens the issuer address for compact display', () => {
      render(<TokenCard token={baseToken} />);
      const issuerElement = screen.getByText(`${ISSUER.slice(0, 4)}…${ISSUER.slice(-4)}`);
      expect(issuerElement).toBeInTheDocument();
      expect(issuerElement).toHaveAttribute('title', ISSUER);
    });

    it('shortens the distributor address for compact display', () => {
      render(<TokenCard token={baseToken} />);
      const distributorElement = screen.getByText(
        `${DISTRIBUTOR.slice(0, 4)}…${DISTRIBUTOR.slice(-4)}`
      );
      expect(distributorElement).toBeInTheDocument();
      expect(distributorElement).toHaveAttribute('title', DISTRIBUTOR);
    });

    it('does not shorten addresses that are already short', () => {
      const shortIssuer = 'GABCDEFGHIJ';
      const shortToken = { ...baseToken, asset_issuer: shortIssuer, distributor_address: shortIssuer };
      render(<TokenCard token={shortToken} />);
      // Should render twice - once for issuer, once for distributor
      expect(screen.getAllByText(shortIssuer)).toHaveLength(2);
    });
  });

  describe('metadata structure', () => {
    it('uses a definition list for the metadata', () => {
      const { container } = render(<TokenCard token={baseToken} />);
      const definitionList = container.querySelector('dl');
      expect(definitionList).toBeInTheDocument();
    });

    it('labels the issuer and distributor fields', () => {
      render(<TokenCard token={baseToken} />);
      expect(screen.getByText('Issuer')).toBeInTheDocument();
      expect(screen.getByText('Distributor')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('renders as an article for semantic HTML', () => {
      const { container } = render(<TokenCard token={baseToken} />);
      const article = container.querySelector('article');
      expect(article).toBeInTheDocument();
    });

    it('provides full addresses in title attributes for assistive tech', () => {
      render(<TokenCard token={baseToken} />);
      const elements = screen.getAllByTitle(ISSUER);
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('handles very large supply numbers', () => {
      const largeSupplyToken = { ...baseToken, total_supply: '999999999999.1234567' };
      render(<TokenCard token={largeSupplyToken} />);
      expect(screen.getByText('999,999,999,999.1234567')).toBeInTheDocument();
    });

    it('handles very small supply numbers', () => {
      const smallSupplyToken = { ...baseToken, total_supply: '0.0000001', decimals: 7 };
      render(<TokenCard token={smallSupplyToken} />);
      expect(screen.getByText('0.0000001')).toBeInTheDocument();
    });

    it('handles zero supply', () => {
      const zeroSupplyToken = { ...baseToken, total_supply: '0' };
      render(<TokenCard token={zeroSupplyToken} />);
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });
});
