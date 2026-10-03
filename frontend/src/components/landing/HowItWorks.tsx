import styles from './HowItWorks.module.css';

/**
 * The four moves that take a group from "we pool money in a notebook" to a
 * working ledger.
 *
 * Each step names the part of the codebase that performs it. A landing page for
 * an open-source project is read partly by people deciding whether to
 * contribute, and pointing at the real module is more persuasive than a verb.
 */
const STEPS = [
  {
    title: 'Issue the community token',
    body: 'An admin creates a Stellar issuer account and mints the group’s asset — ECOLGS for Eco Lagos, one code per community. Supply is visible on-chain from the first transaction.',
    source: 'contracts/assets.ts',
  },
  {
    title: 'Members open a trustline',
    body: 'Each member signs a trustline from their own Freighter wallet, opting in to hold the asset. Nobody hands over a key, and the community never custodies a member’s funds.',
    source: 'contracts/trustlines.ts',
  },
  {
    title: 'Lend to each other',
    body: 'A member requests a loan; another funds it. The transfer and every repayment settle as ordinary Stellar payments, so the schedule and the ledger cannot disagree.',
    source: 'POST /api/v1/loans',
  },
  {
    title: 'Repayment becomes reputation',
    body: 'Settled repayments accumulate into a score the whole community can see. Standing is earned from a public record instead of assessed by a credit bureau that has never heard of you.',
    source: 'GET /api/v1/reputation',
  },
] as const;

/** The four-step explainer, rendered as an ordered list because it is one. */
export function HowItWorks() {
  return (
    <ol className={styles.steps}>
      {STEPS.map((step, index) => (
        <li key={step.title} className={styles.step}>
          <span aria-hidden="true" className={styles.marker}>
            {String(index + 1).padStart(2, '0')}
          </span>
          <h3 className={styles.stepTitle}>{step.title}</h3>
          <p className={styles.stepBody}>{step.body}</p>
          <code className={styles.source}>{step.source}</code>
        </li>
      ))}
    </ol>
  );
}
