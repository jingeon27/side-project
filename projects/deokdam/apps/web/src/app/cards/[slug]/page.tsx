import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArrowLeft, Clover } from 'lucide-react';

import { CopyMessage } from '@/features/journal/CopyMessage';
import { RecordForm } from '@/features/journal/RecordForm';
import { ShortsPlayer } from '@/features/shorts/ShortsPlayer';
import { shortsVideo } from '@/features/shorts/source';
import { TrackView } from '@/shared/analytics/TrackView';
import { episodes, episodeShareUrl, findEpisode } from '@/shared/episodes';
import { topics } from '@/shared/topics';
import { ReadingLink } from '@/shared/ui/ReadingLink';
import { SiteFooter } from '@/shared/ui/SiteFooter';

import './episode.css';

type TProps = PageProps<'/cards/[slug]'>;

export function generateStaticParams() {
  return episodes.map(({ slug }) => ({ slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: TProps): Promise<Metadata> {
  const episode = findEpisode((await params).slug);
  if (!episode) notFound();
  const url = episodeShareUrl(episode.slug);
  const title = `${episode.title} | 덕담집`;
  const image = {
    url: new URL(`/images/cards/${episode.slug}.jpg`, url).href,
    width: 1200,
    height: 630,
    type: 'image/jpeg',
    alt: `${episode.title}. ${episode.message}`,
  };
  return {
    title: episode.title,
    description: episode.message,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      locale: 'ko_KR',
      siteName: '덕담집',
      url,
      title,
      description: episode.message,
      images: [image],
    },
    twitter: { card: 'summary_large_image', title, description: episode.message, images: [image] },
  };
}

export default async function EpisodePage({ params }: TProps) {
  const episode = findEpisode((await params).slug);
  if (!episode) notFound();
  const video = shortsVideo(episode.youtubeVideoId);

  return (
    <>
      <TrackView episode={episode.slug} topic={episode.topic} />
      <main id="main-content" className="site-width reading-width inner-page episode-page">
        <Link href="/stories" className="back-link">
          <ArrowLeft size={16} aria-hidden /> 이야기 모아보기
        </Link>
        <header className="episode-heading">
          <p className="label">{topics[episode.topic].label} 상황극</p>
          <h1>{episode.title}</h1>
        </header>
        <CopyMessage
          key={episode.slug}
          topic={episode.topic}
          episode={episode.slug}
          message={episode.message}
        />
        <div className="episode-narrative">
          <h2>이 말을 건넨 날</h2>
          <blockquote>“{episode.hook}”</blockquote>
          <p>{episode.description}</p>
        </div>
        <section className="deok-card episode-deok-card" aria-labelledby="today-action" data-short-card>
          <div className="label">
            <Clover size={18} strokeWidth={1.7} aria-hidden />
            오늘의 덕
          </div>
          <h2 id="today-action">{episode.action}</h2>
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
      </main>
      <SiteFooter />
    </>
  );
}
