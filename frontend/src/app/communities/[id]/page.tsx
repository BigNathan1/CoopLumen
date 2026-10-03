import { CommunityDetailPage } from './CommunityDetailPage';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Next.js App Router page for the community detail route at `/communities/[id]`.
 *
 * The page shell is a server component so the route participates in Next.js
 * static analysis and metadata inference. The interactive content is delegated
 * to `CommunityDetailPage` (a `'use client'` component) which handles data
 * fetching via SWR, loading states, and user interactions.
 */
export default async function CommunityDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return <CommunityDetailPage communityId={id} />;
}
