'use client';

import { CopyToClipboard } from './CopyToClipboard';

interface StellarAddressProps {
  address: string;
  startLength?: number;
  endLength?: number;
  network?: 'testnet' | 'mainnet';
  className?: string;
}

function truncateAddress(
  address: string,
  startLength: number,
  endLength: number,
) {
  if (address.length <= startLength + endLength + 3) {
    return address;
  }

  return `${address.slice(0, startLength)}...${address.slice(-endLength)}`;
}

export function StellarAddress({
  address,
  startLength = 6,
  endLength = 6,
  network = 'mainnet',
  className,
}: StellarAddressProps) {
  const truncatedAddress = truncateAddress(
    address,
    startLength,
    endLength,
  );

  const explorerUrl = `https://stellar.expert/explorer/${network}/account/${encodeURIComponent(address)}`;

  return (
    <div className={className}>
      <span className="sr-only">Stellar address: </span>

      <code title={address}>{truncatedAddress}</code>

      <CopyToClipboard
        value={address}
        label="Copy Stellar address"
        copiedLabel="Address copied"
      />

      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`View Stellar address ${truncatedAddress} on Stellar Expert`}
      >
        View on Stellar Expert
      </a>
    </div>
  );
}
