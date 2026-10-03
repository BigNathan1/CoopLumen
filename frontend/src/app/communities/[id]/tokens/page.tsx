import type { Metadata } from 'next';
import { CommunityTokensView } from '@/components/tokens/CommunityTokensView';

export const metadata: Metadata = {
  title: 'Tokens | CoopLumen',
  description: 'Manage the tokens issued for a CoopLumen community.',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CommunityTokensPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <main>
      <CommunityTokensView communityId={id} />
    </main>
  );
}
