import type { Metadata } from 'next';
import { LoansPage } from './LoansPage';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata: Metadata = {
  title: 'Community Loans | CoopLumen',
  description: 'View and manage peer-to-peer loans for this community.',
};

/**
 * Next.js App Router page for the community loans route at `/communities/[id]/loans`.
 *
 * The page shell is a server component so the route participates in Next.js
 * static analysis and metadata inference. The interactive content is delegated
 * to `LoansPage` (a `'use client'` component) which handles data fetching,
 * loading states, and user interactions.
 */
export default async function CommunityLoansPage({ params }: PageProps) {
  const { id } = await params;
  return <LoansPage communityId={id} />;
}
