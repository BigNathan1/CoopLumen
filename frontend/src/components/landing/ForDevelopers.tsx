import styles from './ForDevelopers.module.css';

/**
 * The API surface, as actually mounted in `backend/src/api/routes/index.ts`
 * under the `/api/v1` prefix. Kept to the resources a newcomer would reach for
 * first rather than listing all twelve routers.
 */
const ENDPOINTS = [
  { path: '/api/v1/communities', summary: 'Register a group, manage its members' },
  { path: '/api/v1/tokens', summary: 'Issue and distribute the community asset' },
  { path: '/api/v1/trustlines', summary: 'Build trustline transactions to sign' },
  { path: '/api/v1/loans', summary: 'Request, fund and repay peer-to-peer loans' },
  { path: '/api/v1/reputation', summary: 'Repayment history as a borrower score' },
  { path: '/api/v1/balances', summary: 'Read holdings straight from Horizon' },
] as const;

/** The three tiers the request actually passes through. */
const STACK = [
  {
    tier: 'Browser',
    detail: 'Next.js App Router · Freighter signs in the wallet, never on the server',
  },
  {
    tier: 'API',
    detail: 'Express · Zod-validated requests · PostgreSQL for off-chain metadata',
  },
  {
    tier: 'Network',
    detail: 'Stellar Horizon · assets, trustlines and payments · Soroban next',
  },
] as const;

/**
 * The developer section: what the API looks like and what sits behind it.
 *
 * The sample is a plain `fetch` rather than an SDK call because there is no SDK
 * — the point being made is that the whole thing is reachable with the standard
 * library, and a reader can paste it into a console right now.
 */
export function ForDevelopers() {
  return (
    <div className={styles.layout}>
      <div className={styles.column}>
        <h3 className={styles.columnTitle}>A REST API, and nothing to install</h3>

        {/*
          A code sample, not a code editor: `tabIndex` makes the scrollable
          region keyboard-reachable, which a `pre` that can scroll otherwise is
          not.
        */}
        <div className={styles.code} tabIndex={0} role="group" aria-label="Example API request">
          <div aria-hidden="true" className={styles.codeBar}>
            <span className={styles.codeDot} />
            <span className={styles.codeDot} />
            <span className={styles.codeDot} />
            <span className={styles.codeFile}>request.ts</span>
          </div>
          <pre className={styles.pre}>
            <code>{`const res = await fetch(
  'https://api.cooplumen.org/api/v1/communities',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Eco Lagos',
      asset_code: 'ECOLGS',
      description: 'Solar co-op, Lagos mainland',
    }),
  },
);

const { id, issuer_public_key } = await res.json();`}</code>
          </pre>
        </div>

        <dl className={styles.stack}>
          {STACK.map((layer) => (
            <div key={layer.tier} className={styles.layer}>
              <dt className={styles.layerTier}>{layer.tier}</dt>
              <dd className={styles.layerDetail}>{layer.detail}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className={styles.column}>
        <h3 className={styles.columnTitle}>Endpoints</h3>

        <ul className={styles.endpoints}>
          {ENDPOINTS.map((endpoint) => (
            <li key={endpoint.path} className={styles.endpoint}>
              <code className={styles.endpointPath}>{endpoint.path}</code>
              <span className={styles.endpointSummary}>{endpoint.summary}</span>
            </li>
          ))}
        </ul>

        <p className={styles.footnote}>
          The full surface is specified in <code>docs/openapi.yaml</code>, and every route is
          validated with Zod before it reaches the network.
        </p>
      </div>
    </div>
  );
}
