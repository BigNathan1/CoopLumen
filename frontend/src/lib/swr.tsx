'use client';

import { SWRConfig } from 'swr';
import { api } from '@/lib/api';

/**
 * Default SWR fetcher: GETs `path` through the shared API client, which adds
 * the session and CSRF headers and unwraps the `data` field of the response
 * envelope. Non-2xx responses reject with an ApiError carrying the API's message.
 */
export function fetcher<T>(path: string): Promise<T> {
  return api.get<T>(path);
}

/** App-wide SWR defaults; hooks override `refreshInterval` where they need to. */
export const swrConfig = {
  fetcher,
  revalidateOnFocus: false,
  errorRetryCount: 3,
  refreshInterval: 30_000,
  dedupingInterval: 2_000,
} as const;

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={swrConfig}>{children}</SWRConfig>;
}
