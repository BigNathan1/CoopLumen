import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CommunityGovernanceWorkspace } from '@/components/governance/CommunityGovernanceWorkspace';

interface CommunityGovernancePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: CommunityGovernancePageProps): Promise<Metadata> {
  const { id } = await params;

  return {
    title: `Governance · Community ${id}`,
    description:
      'Create proposals and vote on community decisions with token-weighted, on-chain governance.',
  };
}

export default async function CommunityGovernancePage({ params }: CommunityGovernancePageProps) {
  const { id } = await params;

  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    notFound();
  }

  return (
    <main className="community-governance-page">
      <header className="community-governance-page__header">
        <h1 className="community-governance-page__title">Governance</h1>
        <p className="community-governance-page__subtitle">
          Create proposals and vote on community decisions. Votes are token-weighted and recorded
          on-chain.
        </p>
      </header>

      <CommunityGovernanceWorkspace communityId={id} />
    </main>
  );
}
