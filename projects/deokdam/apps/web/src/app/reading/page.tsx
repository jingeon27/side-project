import Link from 'next/link';

import { PersonalReading } from '@/features/reading/PersonalReading';
import { publicMetadata } from '@/shared/site';
import { topics, topicSchema } from '@/shared/topics';

export const metadata = publicMetadata(
  '/reading',
  '생년월일로 보는 AI 사주 풀이',
  '생년월일과 태어난 시각으로 네 기둥을 읽고, 취업·대입·자녀 응원 고민에 맞는 오늘의 풀이와 실천 예시를 만나보세요.',
);

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
