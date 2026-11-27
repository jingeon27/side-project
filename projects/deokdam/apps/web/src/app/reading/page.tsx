import type { Metadata } from 'next';
import Link from 'next/link';

import { PersonalReading } from '@/features/reading/PersonalReading';
import { topics, topicSchema } from '@/shared/topics';

export const metadata: Metadata = { title: '내 사주 풀이' };

export default async function ReadingPage({ searchParams }: PageProps<'/reading'>) {
  const params = await searchParams;
  const input = topicSchema.safeParse(params.topic);
  const topic = input.success ? input.data : 'job';
  const adUnit = process.env.DEOKDAM_REWARDED_AD_UNIT?.trim();

  return (
    <main id="main-content" className="site-width reading-width inner-page form-page">
      <PersonalReading key={topic} topic={topic} adUnit={adUnit || undefined}>
        <nav className="topic-tabs" aria-label="풀이 유형">
          {topicSchema.options.map((option) => (
            <Link
              href={'/reading?topic=' + option}
              key={option}
              aria-current={topic === option ? 'page' : undefined}
            >
              {topics[option].label}
            </Link>
          ))}
        </nav>
      </PersonalReading>
    </main>
  );
}
