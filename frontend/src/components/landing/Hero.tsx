import Link from 'next/link';
import { SettlementRing } from './SettlementRing';
import styles from './Hero.module.css';

/**
 * Figures the hero stands on. Each is either checkable against the codebase or
 * cited where it is a claim about the world, because a page that opens with
 * numbers has to be able to defend them.
 */
const PROOF_POINTS = [
  { value: '3–5s', label: 'to final settlement' },
  { value: '<$0.00001', label: 'network fee per transfer' },
  { value: '1.4B', label: 'adults still unbanked' },
  { value: 'MIT', label: 'licensed, end to end' },
] as const;

/**
 * The top of the page: the claim, the two doors out of it, and a live
 * demonstration of the claim running beside it.
 *
 * Deliberately a server component. The only thing here that needs the browser
 * is the illustration, which is its own island — the headline, the links and
 * the proof points are all in the first HTML response.
 */
export function Hero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      {/* Two light sources and a ledger rule behind the content, both decorative. */}
      <div aria-hidden="true" className={styles.glow} />
      <div aria-hidden="true" className={styles.rule} />

      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className={styles.badge}>
            <span aria-hidden="true" className={styles.badgeDot} />
            Open source · Built on Stellar
          </p>

          <h1 id="hero-title" className={styles.title}>
            Every community <span className={styles.titleAccent}>is already a bank.</span> Give it
            the ledger.
          </h1>

          <p className={styles.lede}>
            Savings circles, co-ops, diaspora networks and NGOs move billions between people who
            already trust each other — on paper, over the phone, through wires that take days and
            skim percent. CoopLumen gives any group its own token, a shared treasury, and
            peer-to-peer lending that settles in seconds for a fraction of a cent.
          </p>

          <div className={styles.actions}>
            <Link href="/dashboard" className={styles.primaryAction}>
              Open the app
              <span aria-hidden="true" className={styles.arrow}>
                →
              </span>
            </Link>
            <a
              href="https://github.com/BigNathan1/cooplumen"
              className={styles.secondaryAction}
              rel="noreferrer"
            >
              Read the source
            </a>
          </div>

          <dl className={styles.proof}>
            {PROOF_POINTS.map((point) => (
              <div key={point.label} className={styles.proofItem}>
                <dt className={styles.proofValue}>{point.value}</dt>
                <dd className={styles.proofLabel}>{point.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className={styles.visual}>
          <SettlementRing />
        </div>
      </div>
    </section>
  );
}
