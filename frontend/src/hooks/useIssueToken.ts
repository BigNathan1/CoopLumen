import { useCallback, useState } from 'react';
import { mutate } from 'swr';
import { api, getBaseUrl } from '@/lib/api';

export interface IssueTokenInput {
  issuerPublicKey: string;
  assetCode: string;
  distributorPublicKey: string;
  amount: string;
  memo?: string;
  /** Community whose token list should be refreshed after issuance. */
  communityId?: string;
}

/** Builds an issuance payment, requests Freighter approval, and submits it. */
export function useIssueToken() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (input: IssueTokenInput): Promise<string> => {
    setLoading(true);
    setError(null);

    try {
      const { communityId, ...buildInput } = input;
      const { xdr } = await api.post<{ xdr: string }>('/api/v1/tokens/build-issue', buildInput);
      const { signTransaction } = await import('@stellar/freighter-api');
      const signedXdr = await signTransaction(xdr);
      const { txHash } = await api.post<{ txHash: string }>('/api/v1/tokens/submit', {
        signedXdr,
      });

      const baseUrl = getBaseUrl();
      const keysToRevalidate = new Set([
        `${baseUrl}/api/v1/balances/${input.issuerPublicKey}`,
        `${baseUrl}/api/v1/balances/${input.distributorPublicKey}`,
      ]);
      if (communityId) {
        keysToRevalidate.add(`${baseUrl}/api/v1/tokens/${communityId}`);
      }

      await mutate((key) => typeof key === 'string' && keysToRevalidate.has(key), undefined, {
        revalidate: true,
      });
      return txHash;
    } catch (caught) {
      const message =
        caught instanceof Error && caught.message ? caught.message : 'Failed to issue token';
      setError(message);
      throw caught instanceof Error && caught.message ? caught : new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { submit, loading, error };
}
