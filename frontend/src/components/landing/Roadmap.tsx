import styles from './Roadmap.module.css';

type PhaseStatus = 'shipping' | 'next' | 'planned';

/**
 * The roadmap as written in `PRD.md`, condensed to what a visitor needs: what
 * works now, what is being built, and what is still an intention.
 *
 * The statuses are honest on purpose. An open-source project that lists Phase 4
 * in the same voice as Phase 1 teaches contributors not to trust its roadmap.
 */
const PHASES: readonly {
  phase: string;
  title: string;
  target: string;
  status: PhaseStatus;
  items: readonly string[];
}[] = [
  {
    phase: 'Phase 1',
    title: 'Foundation',
    target: 'Q3 2026',
    status: 'shipping',
    items: [
      'Asset issuance, trustlines and payments on Stellar',
      'Community registration and member management',
      'Balance dashboard with Freighter wallet',
    ],
  },
  {
    phase: 'Phase 2',
    title: 'Peer-to-peer lending',
    target: 'Q4 2026',
    status: 'next',
    items: [
      'Loan request, funding and acceptance flow',
      'On-chain repayment tracking and reputation scoring',
      'Multi-sig treasuries and batch disbursement',
    ],
  },
  {
    phase: 'Phase 3',
    title: 'On-chain governance',
    target: 'Q1 2027',
    status: 'planned',
    items: [
      'Soroban contract for proposal voting',
      'Token-weighted governance with snapshots',
      'Disbursement, membership and rule-change proposals',
    ],
  },
  {
    phase: 'Phase 4',
    title: 'Identity and corridors',
    target: 'Q2–Q3 2027',
    status: 'planned',
    items: [
      'SEP-12 KYC and decentralised identity',
      'Price oracles for loan valuation',
      'Remittance corridors via Stellar anchors',
    ],
  },
];

const STATUS_LABEL: Record<PhaseStatus, string> = {
  shipping: 'Shipping now',
  next: 'In progress',
  planned: 'Planned',
};

/** The roadmap, as a list of phases with an honest status on each. */
export function Roadmap() {
  return (
    <ol className={styles.track}>
      {PHASES.map((phase) => (
        <li key={phase.phase} className={styles.phase} data-status={phase.status}>
          <div className={styles.phaseHead}>
            <span className={styles.phaseNumber}>{phase.phase}</span>
            <span className={styles.status}>{STATUS_LABEL[phase.status]}</span>
          </div>

          <h3 className={styles.phaseTitle}>{phase.title}</h3>
          <p className={styles.target}>{phase.target}</p>

          <ul className={styles.items}>
            {phase.items.map((item) => (
              <li key={item} className={styles.item}>
                {item}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
