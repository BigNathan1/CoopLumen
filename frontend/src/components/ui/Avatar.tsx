import type { ImgHTMLAttributes } from 'react';

export interface AvatarProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  address: string;
  src?: string;
  alt?: string;
  size?: number;
}

function truncateAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 5)}…${address.slice(-4)}`;
}

function hashAddress(address: string): number {
  let hash = 2166136261;

  for (let index = 0; index < address.length; index += 1) {
    hash ^= address.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createIdenticon(address: string): string {
  const hash = hashAddress(address);
  const cells: string[] = [];

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const bitIndex = row * 3 + column;
      const filled = ((hash >>> (bitIndex % 32)) & 1) === 1;

      if (filled) {
        const x = column * 20;
        const mirroredX = 80 - x;

        cells.push(`<rect x="${x}" y="${row * 20}" width="20" height="20"/>`);

        if (column !== 2) {
          cells.push(
            `<rect x="${mirroredX}" y="${row * 20}" width="20" height="20"/>`,
          );
        }
      }
    }
  }

  const hue = hash % 360;

  const svg = `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      role="img"
      aria-label="Identicon for ${address}"
    >
      <rect width="100" height="100" rx="20" fill="hsl(${hue} 55% 45%)"/>
      <g fill="white">${cells.join('')}</g>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function Avatar({
  address,
  src,
  alt,
  size = 40,
  className,
  ...props
}: AvatarProps) {
  const label = alt ?? `Stellar address ${truncateAddress(address)}`;
  const fallback = createIdenticon(address);

  return (
    <img
      {...props}
      src={src || fallback}
      alt={label}
      width={size}
      height={size}
      className={['avatar', className].filter(Boolean).join(' ')}
      data-address={address}
    />
  );
}
