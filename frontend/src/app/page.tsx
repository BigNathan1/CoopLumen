import type { Metadata } from 'next';
import { LandingNav } from '@/components/landing/LandingNav';
import { Hero } from '@/components/landing/Hero';
import { Section } from '@/components/landing/Section';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { CostComparator } from '@/components/landing/CostComparator';
import { Personas } from '@/components/landing/Personas';
import { ForDevelopers } from '@/components/landing/ForDevelopers';
import { Roadmap } from '@/components/landing/Roadmap';
import { LandingFooter } from '@/components/landing/LandingFooter';
import styles from '@/components/landing/Landing.module.css';

export const metadata: Metadata = {
  title: 'CoopLumen — Community finance that settles in seconds',
  description:
    'Open-source community finance on Stellar. Any group can issue its own token, run a shared treasury, and lend peer to peer — settled in seconds for a fraction of a cent.',
  openGraph: {
    title: 'CoopLumen — Community finance that settles in seconds',
    description:
      'Open-source community finance on Stellar. Issue a community token, run a shared treasury, lend peer to peer.',
    type: 'website',
  },
};

/**
 * The public landing page.
 *
 * Everything here is a server component except two islands — the nav (sticky
 * state and the narrow-screen disclosure) and the cost comparator — so the
 * argument the page is making arrives as HTML and does not wait on JavaScript.
 *
 * The product itself lives at `/dashboard`; this page's job is to be the reason
 * someone goes there.
 */
export default function LandingPage() {
  return (
    <div className={styles.page}>
      <a href="#main" className={styles.skipLink}>
        Skip to content
      </a>

      <LandingNav />

      <main id="main">
        <Hero />

        <Section
          id="how-it-works"
          eyebrow="How it works"
          title="Four steps from a notebook to a ledger"
          lede="No new financial instrument to learn. The same circle of people, the same money going round — with a record nobody has to be trusted to keep."
          banded
        >
          <HowItWorks />
        </Section>

        <Section
          id="cost"
          eyebrow="The arithmetic"
          title="Most of the cost of moving money is the moving"
          lede="A savings circle sends the same money round month after month, and every round pays a toll. Move the slider to see what each rail takes out of it."
        >
          <CostComparator />
        </Section>

        <Section
          id="who-its-for"
          eyebrow="Who it's for"
          title="Groups that already run on trust"
          lede="CoopLumen does not create the community. It gives one that already exists the ledger, the token and the audit trail it has been doing without."
          banded
        >
          <Personas />
        </Section>

        <Section
          id="developers"
          eyebrow="For developers"
          title="A small API over a public chain"
          lede="Express and PostgreSQL in front, Stellar behind, and nothing proprietary in between. Read it, run it locally, send a pull request."
        >
          <ForDevelopers />
        </Section>

        <Section
          id="roadmap"
          eyebrow="Roadmap"
          title="What works, and what is still a promise"
          lede="Phase 1 is in the repository today. Everything after it is planned in the open, and the status on each phase below says which is which."
          banded
        >
          <Roadmap />
        </Section>
      </main>

      <LandingFooter />
    </div>
  );
}
