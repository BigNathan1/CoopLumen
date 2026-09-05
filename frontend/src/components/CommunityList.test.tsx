// frontend/src/app/communities/page.tsx
import React from "react";
import { CommunityList } from "@/components/communities/CommunityList";
import type { Community } from "@/types/community";

// Mock data generator for MVP phase
const generateMockCommunities = (): Community[] => {
  return Array.from({ length: 15 }, (_, i) => ({
    id: `comm-${i + 1}`,
    name: `${['Solar', 'Green', 'Urban', 'Tech', 'Local'][i % 5]} Co-op ${i + 1}`,
    description: `A forward-thinking cooperative focused on decentralized resources and community ownership in the ${
      ['energy', 'farming', 'housing', 'software', 'logistics'][i % 5]
    } sector.`,
    memberCount: Math.floor(Math.random() * 5000) + 50,
    tokenCount: Math.floor(Math.random() * 100000) + 1000,
    isJoined: i % 4 === 0,
  }));
};

export const metadata = {
  title: "Discover Communities | CoopLumen",
  description: "Find and join decentralized cooperatives powered by CoopLumen.",
};

export default async function CommunitiesDiscoveryPage() {
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