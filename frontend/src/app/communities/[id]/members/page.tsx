import type { Metadata } from 'next';
import { MembersPage } from './MembersPage';
import styles from './page.module.css';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Manage Members | CoopLumen`,
    description: `Add and remove members for community ${id}.`,
  };
}

/**
 * Next.js App Router page for the member-management route at
 * `/communities/[id]/members`.
 *
 * The page shell is a server component so the route participates in Next.js
 * static analysis and metadata inference. The interactive content is delegated
 * to `MembersPage` (a `'use client'` component) which handles data fetching,
 * loading states, and user interactions.
 */
export default async function MembersRoute({ params }: PageProps) {
  const { id } = await params;

  return (
    <main className={styles.page} aria-label="Member management">
      <div className={styles.inner}>
        <header className={styles.header}>
          <h1 className={styles.heading}>Manage members</h1>
        </header>

        <MembersPage communityId={id} />
      </div>
    </main>
  );
}
