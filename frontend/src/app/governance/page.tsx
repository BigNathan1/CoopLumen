// frontend/src/app/governance/page.tsx
import { GovernanceDashboard } from '@/components/governance/GovernanceDashboard';
import { GovernanceWorkspace } from './GovernanceWorkspace';

interface PageProps {
  searchParams: Promise<{ communityId?: string }>;
}

export default async function GovernancePage({ searchParams }: PageProps) {
  const { communityId = '' } = await searchParams;
  return (
    <>
      <GovernanceDashboard communityId={communityId} />
      <GovernanceWorkspace initialCommunityId={communityId} />
    </>
  );
}
