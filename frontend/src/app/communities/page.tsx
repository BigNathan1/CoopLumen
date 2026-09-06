import React from 'react';
import { CommunityList } from '@/components/CommunityList';
import type { DiscoverableCommunity } from '@/components/CommunityCard';

// Mock data generator for MVP phase, until the discovery endpoint lands.
const SECTORS = ['energy', 'farming', 'housing', 'software', 'logistics'];
const PREFIXES = ['Solar', 'Green', 'Urban', 'Tech', 'Local'];

function generateMockCommunities(): DiscoverableCommunity[] {
  return Array.from({ length: 15 }, (_, i) => ({
    id: `comm-${i + 1}`,
    name: `${PREFIXES[i % PREFIXES.length]} Co-op ${i + 1}`,
    description: `A forward-thinking cooperative focused on decentralized resources and community ownership in the ${SECTORS[i % SECTORS.length]} sector.`,
    asset_code: `CO${i + 1}`,
    asset_issuer: `G${'A'.repeat(54)}${i % 10}`,
    issuer_public_key: `G${'A'.repeat(54)}${i % 10}`,
    created_at: new Date(Date.UTC(2025, i % 12, 1)).toISOString(),
    member_count: (i + 1) * 137,
    token_count: (i + 1) * 2500,
    is_joined: i % 4 === 0,
  }));
}

export const metadata = {
  title: 'Discover Communities | CoopLumen',
  description: 'Find and join decentralized cooperatives powered by CoopLumen.',
};

export default function CommunitiesDiscoveryPage(): React.JSX.Element {
  const communities = generateMockCommunities();

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 dark:bg-[#0a0a0a] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Discover Communities
          </h1>
          <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
            Browse active cooperatives, view their metrics, and join the network.
          </p>
        </div>

        <CommunityList initialCommunities={communities} itemsPerPage={6} />
      </div>
    </div>
  );
}
