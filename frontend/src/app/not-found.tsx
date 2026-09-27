import Link from 'next/link';
import styles from './not-found.module.css';

export const metadata = {
  title: 'Page not found | CoopLumen',
  description: 'The page you were looking for could not be found.',
};

export default function NotFound() {
  return (
    <div className={styles.layout}>
      <div className={styles.content}>
        <span className={styles.code} aria-hidden="true">
          404
        </span>
        <h1 className={styles.title}>Page not found</h1>
        <p className={styles.message}>
          The page you were looking for doesn&apos;t exist, or may have moved.
        </p>
        <div className={styles.actions}>
          <Link href="/dashboard" className={`${styles.action} ${styles.primary}`}>
            Go to dashboard
          </Link>
          <Link href="/" className={`${styles.action} ${styles.secondary}`}>
            Back to homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
