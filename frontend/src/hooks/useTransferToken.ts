import { useCallback, useState } from 'react';
import { mutate } from 'swr';
import { api, getBaseUrl } from '@/lib/api';

export interface TransferTokenInput {
  senderPublicKey: string;
  destinationPublicKey: string;
  assetCode: string;
  assetIssuer?: string;
  amount: string;
}

export type TransferProgressHandler = (stage: string | null) => void;

/** Builds, wallet-signs, and submits a Stellar payment transaction. */
export function useTransferToken() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (input: TransferTokenInput, onProgress?: TransferProgressHandler): Promise<string> => {
      setLoading(true);
      setError(null);

      try {
        onProgress?.('Building the transfer…');
        const { xdr } = await api.post<{ xdr: string }>('/api/v1/transactions/unsigned', {
          ...input,
          assetIssuer: input.assetIssuer ?? '',
        });

        onProgress?.('Approve the transfer in your wallet…');
        const { signTransaction } = await import('@stellar/freighter-api');
        const signedXdr = await signTransaction(xdr);

        onProgress?.('Submitting the signed transfer…');
        const { txHash } = await api.post<{ txHash: string }>('/api/v1/tokens/transfer', {
          signedXdr,
        });

        const baseUrl = getBaseUrl();
        const balanceKeys = new Set([
          `${baseUrl}/api/v1/balances/${input.senderPublicKey}`,
          `${baseUrl}/api/v1/balances/${input.destinationPublicKey}`,
        ]);
        await mutate((key) => typeof key === 'string' && balanceKeys.has(key), undefined, {
          revalidate: true,
        });

        return txHash;
      } catch (caught) {
        const message =
          caught instanceof Error && caught.message
            ? caught.message
            : 'Could not send this transfer. Please try again.';
        setError(message);
        throw caught instanceof Error && caught.message ? caught : new Error(message);
      } finally {
        onProgress?.(null);
        setLoading(false);
      }
    },
    []
  );

  return { submit, loading, error };
}
