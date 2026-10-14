import { Trophy } from 'lucide-react';

import { getResultHeadline } from '../lib/ranking.helper';

/** 종료된 대회 위쪽 결과 배너. 공동 우승·무투표 문구를 구분한다. */
export function ResultBanner({ winnerCount }: { winnerCount: number }) {
  const headline = getResultHeadline(winnerCount);
  return (
    <section className="flex items-start gap-3 rounded-card bg-accent-soft p-4 text-ink">
      <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-ink">
        <Trophy className="size-6" />
      </span>
      <div className="min-w-0">
        <h2 className="text-title text-ink">{headline.title}</h2>
        <p className="mt-1 text-body text-accent-ink">{headline.description}</p>
      </div>
    </section>
  );
}
