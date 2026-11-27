import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArrowLeft, Clover } from 'lucide-react';

import { CopyMessage } from '@/features/journal/CopyMessage';
import { RecordForm } from '@/features/journal/RecordForm';
import { ShortsPlayer } from '@/features/shorts/ShortsPlayer';
import { shortsVideo } from '@/features/shorts/source';
import { TrackView } from '@/shared/analytics/TrackView';
import { episodes, findEpisode } from '@/shared/episodes';
import { topics } from '@/shared/topics';
import { ReadingLink } from '@/shared/ui/ReadingLink';
import { SiteFooter } from '@/shared/ui/SiteFooter';

type TProps = PageProps<'/cards/[slug]'>;

export function generateStaticParams() {
  return episodes.map(({ slug }) => ({ slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: TProps): Promise<Metadata> {
  const episode = findEpisode((await params).slug);
  return episode ? { title: episode.title, description: episode.hook } : {};
}

export default async function EpisodePage({ params }: TProps) {
  const episode = findEpisode((await params).slug);
  if (!episode) notFound();
  const video = shortsVideo(episode.youtubeVideoId);

  return (
    <>
      <TrackView episode={episode.slug} topic={episode.topic} />
      <main id="main-content" className="site-width reading-width inner-page">
        <Link href="/#stories" className="back-link">
          <ArrowLeft size={16} aria-hidden /> 이야기 모아보기
        </Link>
        <div className="episode-heading">
          <p className="label">{topics[episode.topic].label} 이야기</p>
          <h1>{episode.title}</h1>
          <p className="intro-quote">“{episode.hook}”</p>
        </div>
        <section className="deok-card episode-deok-card" aria-labelledby="today-action" data-short-card>
          <div className="label">
            <Clover size={18} strokeWidth={1.7} aria-hidden />
            오늘의 덕
          </div>
          <h2 id="today-action">{episode.action}</h2>
          <CopyMessage topic={episode.topic} episode={episode.slug} message={episode.message} />
        </section>
        {video && <ShortsPlayer source={video} title={episode.title + ' 영상'} episode={episode.slug} />}
        <RecordForm
          action={episode.action}
          alternative={episode.alternative}
          topic={episode.topic}
          episode={episode.slug}
        />
        <aside className="reading-invitation">
          <p>내 상황에 맞는 덕을 찾아보세요.</p>
          <ReadingLink className="plain-link" surface="episode" topic={episode.topic}>
            내 사주 풀이
          </ReadingLink>
        </aside>
        <div className="episode-context">
          {episode.image && (
            <div className="episode-image">
              <Image src={episode.image} alt="" fill sizes="(max-width: 760px) 100vw, 672px" />
            </div>
          )}
          <p className="episode-intro">{episode.description}</p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
