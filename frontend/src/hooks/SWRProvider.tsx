'use client';

import { SWRConfig } from 'swr';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function fetcher<T>(path: string): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Request failed');
  }
  return (res.json() as Promise<{ data: T }>).then((r) => r.data);
}

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
