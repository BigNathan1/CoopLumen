import type { Metadata } from 'next';
import { EditCommunityPageClient } from './EditCommunityPageClient';

export const metadata: Metadata = {
  title: 'Edit Community | CoopLumen',
  description: 'Update a CoopLumen community profile.',
};

interface EditCommunityPageProps {
  params: Promise<{ id: string }>;
}

/** App Router entry point for editing one community. */
export default async function EditCommunityPage({ params }: EditCommunityPageProps) {
  const { id } = await params;
  return <EditCommunityPageClient communityId={id} />;
}
