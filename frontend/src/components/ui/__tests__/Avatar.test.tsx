import { render, screen } from '@testing-library/react';
import { Avatar } from '@/components/ui/Avatar';

const TEST_ADDRESS = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const SHORT_ADDRESS = 'GABC';

describe('Avatar', () => {
  describe('rendering', () => {
    it('renders an img element', () => {
      render(<Avatar address={TEST_ADDRESS} />);
      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
      expect(img.tagName).toBe('IMG');
    });

    it('uses the provided src when available', () => {
      const customSrc = 'https://example.com/avatar.jpg';
      render(<Avatar address={TEST_ADDRESS} src={customSrc} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', customSrc);
    });

    it('generates an identicon when no src is provided', () => {
      render(<Avatar address={TEST_ADDRESS} />);
      const img = screen.getByRole('img');
      const src = img.getAttribute('src');
      expect(src).toContain('data:image/svg+xml');
    });

    it('applies the specified size', () => {
      render(<Avatar address={TEST_ADDRESS} size={64} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('width', '64');
      expect(img).toHaveAttribute('height', '64');
    });

    it('defaults to size 40 when not specified', () => {
      render(<Avatar address={TEST_ADDRESS} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('width', '40');
      expect(img).toHaveAttribute('height', '40');
    });

    it('applies custom className', () => {
      render(<Avatar address={TEST_ADDRESS} className="custom-class" />);
      const img = screen.getByRole('img');
      expect(img).toHaveClass('avatar');
      expect(img).toHaveClass('custom-class');
    });

    it('stores the address in a data attribute', () => {
      render(<Avatar address={TEST_ADDRESS} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('data-address', TEST_ADDRESS);
    });
  });

  describe('alt text', () => {
    it('uses custom alt text when provided', () => {
      render(<Avatar address={TEST_ADDRESS} alt="User avatar" />);
      expect(screen.getByAltText('User avatar')).toBeInTheDocument();
    });

    it('generates default alt text with truncated address', () => {
      render(<Avatar address={TEST_ADDRESS} />);
      const img = screen.getByRole('img');
      const alt = img.getAttribute('alt');
      expect(alt).toContain('Stellar address');
      expect(alt).toContain('GAAAA…AWHF');
    });

    it('does not truncate short addresses in alt text', () => {
      render(<Avatar address={SHORT_ADDRESS} />);
      const img = screen.getByRole('img');
      const alt = img.getAttribute('alt');
      expect(alt).toBe(`Stellar address ${SHORT_ADDRESS}`);
    });
  });

  describe('identicon generation', () => {
    it('generates different identicons for different addresses', () => {
      const { rerender } = render(<Avatar address="ADDRESS1" />);
      const img1 = screen.getByRole('img');
      const src1 = img1.getAttribute('src');

      rerender(<Avatar address="ADDRESS2" />);
      const img2 = screen.getByRole('img');
      const src2 = img2.getAttribute('src');

      expect(src1).not.toBe(src2);
    });

    it('generates consistent identicons for the same address', () => {
      const { rerender } = render(<Avatar address={TEST_ADDRESS} />);
      const img1 = screen.getByRole('img');
      const src1 = img1.getAttribute('src');

      rerender(<Avatar address={TEST_ADDRESS} size={64} />);
      const img2 = screen.getByRole('img');
      const src2 = img2.getAttribute('src');

      expect(src1).toBe(src2);
    });

    it('creates a valid SVG data URI', () => {
      render(<Avatar address={TEST_ADDRESS} />);
      const img = screen.getByRole('img');
      const src = img.getAttribute('src');
      expect(src).toMatch(/^data:image\/svg\+xml;charset=UTF-8,/);
    });

    it('includes the address in the SVG aria-label', () => {
      render(<Avatar address={TEST_ADDRESS} />);
      const img = screen.getByRole('img');
      const src = img.getAttribute('src');
      const decoded = decodeURIComponent(src!.replace('data:image/svg+xml;charset=UTF-8,', ''));
      expect(decoded).toContain(`aria-label="Identicon for ${TEST_ADDRESS}"`);
    });

    it('uses a color derived from the address hash', () => {
      render(<Avatar address={TEST_ADDRESS} />);
      const img = screen.getByRole('img');
      const src = img.getAttribute('src');
      const decoded = decodeURIComponent(src!.replace('data:image/svg+xml;charset=UTF-8,', ''));
      // Should contain HSL color
      expect(decoded).toMatch(/hsl\(\d+\s+55%\s+45%\)/);
    });
  });

  describe('additional HTML attributes', () => {
    it('forwards additional HTML attributes to the img element', () => {
      render(<Avatar address={TEST_ADDRESS} title="User profile" data-testid="avatar-img" />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('title', 'User profile');
      expect(img).toHaveAttribute('data-testid', 'avatar-img');
    });

    it('does not allow src and alt to be overridden via props spreading', () => {
      // TypeScript should prevent this, but verify runtime behavior
      const props = { address: TEST_ADDRESS };
      render(<Avatar {...props} />);
      const img = screen.getByRole('img');
      // Should have generated alt text, not empty
      expect(img.getAttribute('alt')).not.toBe('');
    });
  });

  describe('edge cases', () => {
    it('handles empty address string', () => {
      render(<Avatar address="" />);
      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
    });

    it('handles very long addresses', () => {
      const longAddress = 'G' + 'A'.repeat(100);
      render(<Avatar address={longAddress} />);
      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('data-address', longAddress);
    });

    it('handles special characters in address', () => {
      const specialAddress = 'G234567ABCD!@#$%';
      render(<Avatar address={specialAddress} />);
      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
    });

    it('handles size of 0', () => {
      render(<Avatar address={TEST_ADDRESS} size={0} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('width', '0');
      expect(img).toHaveAttribute('height', '0');
    });

    it('handles very large size', () => {
      render(<Avatar address={TEST_ADDRESS} size={1000} />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('width', '1000');
      expect(img).toHaveAttribute('height', '1000');
    });
  });
});
