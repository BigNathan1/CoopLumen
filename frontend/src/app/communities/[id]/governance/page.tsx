import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { GovernanceWorkspace } from '@/app/governance/GovernanceWorkspace';

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
    <main>
      <header>
        <h1>Governance</h1>
        <p>
          Create proposals and vote on community decisions. Votes are token-weighted and recorded
          on-chain.
        </p>
      </header>

      <GovernanceWorkspace initialCommunityId={id} />
    </main>
  );
}
