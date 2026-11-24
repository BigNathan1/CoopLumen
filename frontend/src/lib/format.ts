/**
 * Formats a decimal string for display without going through floating point,
 * so 7-decimal Stellar amounts never lose precision: `1234.5000000` -> `1,234.5`.
 */
export function formatAmount(amount: string): string {
  const trimmed = amount.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) return trimmed;

  const [, sign, integer, fraction = ''] = match;
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimals = fraction.replace(/0+$/, '');
  return `${sign}${grouped}${decimals ? `.${decimals}` : ''}`;
}

/**
 * Truncates a Stellar address or hash for display.
 * `GABCDEFGH...` -> `GABCDE...EFGH`. Short values pass through unchanged.
 */
export function truncateAddress(address: string, start = 6, end = 4): string {
  if (address.length <= start + end + 3) return address;
  return `${address.slice(0, start)}…${address.slice(-end)}`;
}

/**
 * Truncates a hash for display.
 */
export function truncateHash(hash: string, start = 8, end = 6): string {
  if (hash.length <= start + end + 3) return hash;
  return `${hash.slice(0, start)}...${hash.slice(-end)}`;
}
