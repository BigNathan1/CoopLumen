import type { ReactNode } from 'react';
import styles from './Landing.module.css';

export interface SectionProps {
  /** Anchor target, also used to label the section for assistive tech. */
  id: string;
  /** Small caps label above the heading. */
  eyebrow: string;
  /** The section's `h2`. */
  title: string;
  /** Optional standfirst under the heading. */
  lede?: ReactNode;
  /** Tints the section band, so consecutive sections alternate. */
  banded?: boolean;
  children: ReactNode;
}

/**
 * The shared chrome every landing section wears: the band, the measure, and the
 * eyebrow / heading / lede stack.
 *
 * Keeping it in one place is what stops nine hand-built sections from drifting
 * apart in spacing and type scale, and it gives every section the heading and
 * `aria-labelledby` wiring for free — the page is one long document, so the
 * heading outline is its primary navigation for a screen reader.
 */
export function Section({ id, eyebrow, title, lede, banded = false, children }: SectionProps) {
  const headingId = `${id}-title`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={[styles.section, banded ? styles.sectionBanded : null].filter(Boolean).join(' ')}
    >
      <div className={styles.sectionInner}>
        <header className={styles.sectionHeader}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h2 id={headingId} className={styles.sectionTitle}>
            {title}
          </h2>
          {lede && <p className={styles.sectionLede}>{lede}</p>}
        </header>

        {children}
      </div>
    </section>
  );
}
