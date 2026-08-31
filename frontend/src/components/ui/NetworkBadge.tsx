interface NetworkBadgeProps {
  network: 'TESTNET' | 'MAINNET';
  className?: string;
}

export function NetworkBadge({
  network,
  className = '',
}: NetworkBadgeProps) {
  const isTestnet = network === 'TESTNET';

  return (
    <span
      role="status"
      aria-label={`Stellar network: ${network}`}
      className={`network-badge network-badge-${network.toLowerCase()} ${className}`.trim()}
    >
      <span aria-hidden="true" className="network-badge-indicator" />
      {network}
    </span>
  );
}
