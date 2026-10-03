import styles from './Personas.module.css';

/**
 * The three primary personas from the PRD, in their own words rather than in
 * feature-list form.
 *
 * `jobs` are the concrete things that person opens the app to do — they map
 * one-to-one onto panels that exist on the dashboard, so the page is not
 * promising anything the product does not have.
 */
const PERSONAS = [
  {
    role: 'Community treasurer',
    need: 'I hold the group’s money and everyone deserves to see what I do with it.',
    jobs: [
      'Issue the community token',
      'Disburse from a shared treasury',
      'Show a public audit trail',
    ],
  },
  {
    role: 'Community member',
    need: 'I need a small loan from people who know me, not a credit score from people who don’t.',
    jobs: [
      'Hold the token in your own wallet',
      'Request and repay loans',
      'Build a portable reputation',
    ],
  },
  {
    role: 'NGO administrator',
    need: 'I move grant money to groups abroad and lose days and percent to the wire.',
    jobs: [
      'Register beneficiary communities',
      'Batch-disburse to many members',
      'Reconcile against the chain',
    ],
  },
] as const;

/** Persona cards — who the product is for, stated as their problem. */
export function Personas() {
  return (
    <ul className={styles.grid}>
      {PERSONAS.map((persona) => (
        <li key={persona.role} className={styles.card}>
          <h3 className={styles.role}>{persona.role}</h3>
          <p className={styles.need}>“{persona.need}”</p>
          <ul className={styles.jobs}>
            {persona.jobs.map((job) => (
              <li key={job} className={styles.job}>
                {job}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
