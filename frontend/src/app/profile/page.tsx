import type { Metadata } from 'next';
import { ProfileOverview } from '@/components/ProfileOverview';

export const metadata: Metadata = {
  title: 'Your Profile | CoopLumen',
  description:
    'Your connected wallet, the assets it holds, and the CoopLumen communities you belong to.',
};

/**
 * The member's own view: the wallet behind the session and the communities it
 * belongs to. A server component, because all the state lives in
 * `ProfileOverview` and there is nothing here that needs to run on a request.
 */
export default function ProfilePage() {
  return <ProfileOverview />;
}
