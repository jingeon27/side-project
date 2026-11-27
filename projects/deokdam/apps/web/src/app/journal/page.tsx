import type { Metadata } from 'next';

import { Journal } from '@/features/journal/Journal';
import { TrackView } from '@/shared/analytics/TrackView';
import { SiteFooter } from '@/shared/ui/SiteFooter';

export const metadata: Metadata = { title: '덕 기록장' };

export default function JournalPage() {
  return (
    <>
      <TrackView />
      <main id="main-content" className="site-width reading-width inner-page">
        <div className="episode-heading">
          <h1>덕 기록장</h1>
          <p>하루에 한 번, 실제로 해본 일을 남겨요.</p>
        </div>
        <Journal />
      </main>
      <SiteFooter />
    </>
  );
}
