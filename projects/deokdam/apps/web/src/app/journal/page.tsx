import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SignOut } from '@/features/account/AccountActions';
import { loginPath } from '@/features/account/navigation';
import { currentAccount } from '@/features/account/session';
import { Journal } from '@/features/journal/Journal';
import { TrackView } from '@/shared/analytics/TrackView';
import { SiteFooter } from '@/shared/ui/SiteFooter';

export const metadata: Metadata = { title: '덕 기록장', robots: { index: false, follow: false } };

export default async function JournalPage({ searchParams }: PageProps<'/journal'>) {
  const resume = (await searchParams).draft === '1';
  const account = await currentAccount();
  if (!account) redirect(loginPath(resume ? '/journal?draft=1' : '/journal'));
  return (
    <>
      <TrackView page="journal" />
      <main id="main-content" className="site-width reading-width inner-page">
        <div className="episode-heading">
          <h1>덕 기록장</h1>
          <p>하루에 한 번, 실제로 해본 일을 남겨요.</p>
        </div>
        <Journal account={account.id} resume={resume} />
        <SignOut provider={account.provider} />
      </main>
      <SiteFooter />
    </>
  );
}
