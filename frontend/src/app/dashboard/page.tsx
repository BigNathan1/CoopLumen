import type { Metadata } from 'next';
import { Dashboard } from '@/components/Dashboard';

export const metadata: Metadata = {
  title: 'Dashboard | CoopLumen',
  description: 'Your communities, balances, loans and reputation on the Stellar network.',
};

/**
 * The product itself. This used to be the site root; `/` is now the landing
 * page, and the app lives here.
 */
export default function DashboardPage() {
  return (
    <main>
      <Dashboard />
    </main>
  );
}
