import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CommunityTransactions } from '@/components/CommunityTransactions';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';

export const metadata: Metadata = {
  title: 'Transactions | CoopLumen',
  description: "A community's transaction history on the Stellar network.",
};

interface CommunityTransactionsPageProps {
  params: Promise<{ id: string }>;
}

/** App Router entry point for one community's transaction history. */
export default async function CommunityTransactionsPage({
  params,
}: CommunityTransactionsPageProps) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <LoadingSkeleton
          variant="rect"
          height={44}
          count={5}
          gap={8}
          label="Loading transactions"
        />
      }
    >
      <CommunityTransactions communityId={id} />
    </Suspense>
  );
}
