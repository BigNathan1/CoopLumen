import useSWR from 'swr';
import { fetcher } from '@/lib/swr';

/** Public KYC outcome the backend exposes for an account. */
export type KycStatus = 'none' | 'pending' | 'approved' | 'rejected';

/** Shape returned by `GET /api/v1/kyc/status/:address`. */
export interface KycStatusResult {
  address: string;
  status: KycStatus;
  worldId: {
    verified: boolean;
    verifiedAt: string | null;
    verificationLevel: string | null;
  };
}

/**
 * Fetches the KYC status recorded for `address`.
 *
 * The lookup is skipped entirely while the address is unknown (no wallet
 * connected), so callers can render a badge only once `data` arrives and let a
 * failed lookup leave the surrounding UI untouched.
 */
export function useKycStatus(address: string | null | undefined) {
  return useSWR<KycStatusResult>(address ? `/api/v1/kyc/status/${address}` : null, fetcher, {
    revalidateOnFocus: false,
  });
}
