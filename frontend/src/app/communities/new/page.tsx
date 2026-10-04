import type { Metadata } from 'next';
import Link from 'next/link';
import { CreateCommunityForm } from '@/components/CreateCommunityForm';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'New Community | CoopLumen',
  description: 'Register a new decentralised cooperative on the Stellar network.',
};

/**
 * App Router page for the create-community route at `/communities/new`.
 *
 * The page shell is a server component so Next.js can resolve the static
 * metadata and participate in its build-time analysis. The interactive form
 * is delegated to `CreateCommunityForm` (a `'use client'` component).
 */
export default function NewCommunityPage() {
  return (
    <main className={styles.page} aria-label="Create a new community">
      <div className={styles.inner}>
        <Link href="/communities" className={styles.backLink}>
          <span className={styles.backArrow} aria-hidden="true" />
          Back to communities
        </Link>

        <header className={styles.header}>
          <h1 className={styles.heading}>Create a community</h1>
          <p className={styles.subheading}>
            Register a new cooperative on the Stellar network. You&apos;ll need the Stellar public
            key for your token&apos;s issuer account before you start.
          </p>
        </header>

        <div className={styles.card}>
          <CreateCommunityForm />
        </div>
      </div>
    </main>
  );
}
