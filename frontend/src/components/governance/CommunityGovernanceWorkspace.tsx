'use client';

import { GovernanceWorkspace } from '@/app/governance/GovernanceWorkspace';

export interface CommunityGovernanceWorkspaceProps {
  communityId?: string;
  initialCommunityId?: string;
}

export function CommunityGovernanceWorkspace({
  communityId,
  initialCommunityId,
}: CommunityGovernanceWorkspaceProps) {
  return <GovernanceWorkspace communityId={communityId} initialCommunityId={initialCommunityId} />;
}

export default CommunityGovernanceWorkspace;
