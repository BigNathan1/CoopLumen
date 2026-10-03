import Link from 'next/link';
import styles from './LandingFooter.module.css';

const REPO_URL = 'https://github.com/BigNathan1/cooplumen';

const LINK_GROUPS = [
  {
    heading: 'Product',
    links: [
      { label: 'Open the app', href: '/dashboard' },
      { label: 'Browse communities', href: '/communities' },
      { label: 'How it works', href: '#how-it-works' },
      { label: 'Roadmap', href: '#roadmap' },
    ],
  },
  {
    heading: 'Build',
    links: [
      { label: 'Source on GitHub', href: REPO_URL },
      { label: 'Contributing guide', href: `${REPO_URL}/blob/main/CONTRIBUTING.md` },
      { label: 'Architecture notes', href: `${REPO_URL}/blob/main/docs/architecture.md` },
      { label: 'OpenAPI spec', href: `${REPO_URL}/blob/main/docs/openapi.yaml` },
    ],
  },
  {
    heading: 'Network',
    links: [
      { label: 'Stellar', href: 'https://stellar.org' },
      { label: 'Freighter wallet', href: 'https://freighter.app' },
      { label: 'Soroban contracts', href: 'https://soroban.stellar.org' },
      { label: 'Security policy', href: `${REPO_URL}/blob/main/SECURITY.md` },
    ],
  },
] as const;

/** True for anything that should leave the site in the usual way. */
const isExternal = (href: string) => href.startsWith('http');

/**
 * The closing call to action and the site footer.
 *
 * The call to action is the honest one for a project at this stage: the app is
 * open and the code is open, and neither asks for a sign-up first.
 */
export function LandingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.cta}>
          <div aria-hidden="true" className={styles.ctaGlow} />
          <h2 className={styles.ctaTitle}>Start with a community of one.</h2>
          <p className={styles.ctaBody}>
            Connect a Freighter wallet on testnet, issue a token, and send it to someone. Nothing to
            sign up for, and the whole thing is MIT licensed.
          </p>
          <div className={styles.ctaActions}>
            <Link href="/dashboard" className={styles.primaryAction}>
              Open the app
            </Link>
            <a href={REPO_URL} className={styles.secondaryAction} rel="noreferrer">
              Read the source
            </a>
          </div>
        </div>

        <nav className={styles.links} aria-label="Footer">
          {LINK_GROUPS.map((group) => (
            <div key={group.heading} className={styles.group}>
              <h3 className={styles.groupHeading}>{group.heading}</h3>
              <ul className={styles.groupList}>
                {group.links.map((link) => (
                  <li key={link.label}>
                    {isExternal(link.href) ? (
                      <a href={link.href} className={styles.link} rel="noreferrer">
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className={styles.link}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className={styles.baseline}>
          <p className={styles.brand}>
            <span aria-hidden="true" className={styles.mark}>
              ◆
            </span>
            CoopLumen
          </p>
          <p className={styles.fineprint}>
            MIT licensed · Built on Stellar · Not a bank, and not financial advice
          </p>
        </div>
      </div>
    </footer>
  );
}
