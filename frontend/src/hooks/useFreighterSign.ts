import { useState, useCallback } from 'react';
import { isConnected, isAllowed, signTransaction } from '@stellar/freighter-api';

const DEFAULT_NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'TESTNET';

export interface UseFreighterSignResult {
  /** Initiates the signing flow. Accepts an optional XDR override. */
  sign: (overrideXdr?: string, network?: string) => Promise<string>;
  isSigning: boolean;
  error: Error | null;
}

/**
 * Encapsulates the Freighter wallet signing flow.
 *
 * @param defaultXdr - Optional base64 XDR string. Can also be passed directly to the `sign` function.
 * @returns { sign, isSigning, error }
 *
 * @example
 * ```tsx
 * const { sign, isSigning, error } = useFreighterSign(xdr);
 *
 * const handleApprove = async () => {
 *   try {
 *     const signedXdr = await sign();
 *     // Submit signedXdr to your backend
 *   } catch (err) {
 *     // Handle rejection or error
 *   }
 * };
 * ```
 */
export function useFreighterSign(defaultXdr?: string): UseFreighterSignResult {
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sign = useCallback(
    async (overrideXdr?: string, network: string = DEFAULT_NETWORK) => {
      const targetXdr = overrideXdr || defaultXdr;

      setIsSigning(true);
      setError(null);

      try {
        if (!targetXdr) {
          throw new Error('No XDR provided for signing.');
        }

        const connected = await isConnected();
        if (!connected) {
          throw new Error('Freighter is not connected or installed.');
        }

        const allowed = await isAllowed();
        if (!allowed) {
          throw new Error('Freighter is not authorized for this application.');
        }

        const signedXdr = await signTransaction(targetXdr, { network });
        return signedXdr;
      } catch (err: unknown) {
        const errorObj =
          err instanceof Error ? err : new Error(String(err) || 'Failed to sign transaction');
        setError(errorObj);
        throw errorObj;
      } finally {
        setIsSigning(false);
      }
    },
    [defaultXdr]
  );

  return { sign, isSigning, error };
}
