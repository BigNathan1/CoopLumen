import type { Metadata } from 'next';
import { Dashboard } from '@/components/dashboard/Dashboard';

export const metadata: Metadata = {
  title: 'Dashboard | CoopLumen',
  description: 'Your communities, balances, loans and reputation on the Stellar network.',
};

/** The app's home; `/` is the landing page. */
export default function DashboardPage() {
  return (
    <main>
      <Dashboard />
    </main>
  );
}
