import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SignOut } from '@/features/account/AccountActions';
import { loginPath } from '@/features/account/navigation';
import { currentAccount } from '@/features/account/session';
import { Journal } from '@/features/journal/Journal';
import { TrackView } from '@/shared/analytics/TrackView';
import { SiteFooter } from '@/shared/ui/SiteFooter';

export const metadata: Metadata = { title: '덕 기록장', robots: { index: false, follow: false } };

export default async function JournalPage() {
  const account = await currentAccount();
  if (!account) redirect(loginPath('/journal'));
  return (
    <>
      <TrackView page="journal" />
      <main id="main-content" className="site-width reading-width inner-page">
        <div className="episode-heading">
          <h1>덕 기록장</h1>
          <p>내가 만든 덕담과 받은 사주 풀이, 하루하루 해본 일을 다시 만나요.</p>
        </div>
        <Journal key={account.id} account={account.id} />
        <SignOut provider={account.provider} />
      </main>
      <SiteFooter />
    </>
  );
}
