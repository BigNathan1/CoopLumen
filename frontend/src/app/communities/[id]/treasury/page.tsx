import type { Metadata } from 'next';
import { TreasuryOverview } from '@/components/treasury/TreasuryOverview';

export const metadata: Metadata = {
  title: 'Treasury | CoopLumen',
  description: "A community's treasury account and on-chain balances.",
};

interface CommunityTreasuryPageProps {
  params: Promise<{ id: string }>;
}

/** App Router entry point for one community's treasury overview. */
export default async function CommunityTreasuryPage({ params }: CommunityTreasuryPageProps) {
  const { id } = await params;
  return <TreasuryOverview communityId={id} />;
}
