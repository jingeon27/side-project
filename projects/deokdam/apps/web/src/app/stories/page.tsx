import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { connection } from 'next/server';

import { ArrowUpRight } from 'lucide-react';

import { ShortsPlayer } from '@/features/shorts/ShortsPlayer';
import { shortsPlaylist } from '@/features/shorts/source';
import { TrackView } from '@/shared/analytics/TrackView';
import { episodePath, episodes } from '@/shared/episodes';
import { topics } from '@/shared/topics';
import { SiteFooter } from '@/shared/ui/SiteFooter';

import './stories.css';

export const metadata: Metadata = {
  title: '이야기 속 오늘의 덕',
  description: '취업과 입시를 기다리는 사람들의 창작 상황극을 보고, 이야기 속 오늘의 덕을 만나보세요.',
};

const channelShortsPlaylist = 'PLdR732KbVakE';

export default async function StoriesPage() {
  await connection();
  const playlist = shortsPlaylist(process.env.DEOKDAM_SHORTS_PLAYLIST_ID ?? channelShortsPlaylist);
  const heading = (
    <div className="stories-heading">
      <p className="label">덕담집 사주극장</p>
      <h1>이야기 속 오늘의 덕</h1>
      <p>취업과 입시를 기다리는 사람들의 창작 상황극</p>
    </div>
  );

  return (
    <>
      <TrackView page="stories" />
      <main id="main-content" className="site-width stories-page">
        <header className="stories-masthead">
          {playlist ? (
            <ShortsPlayer source={playlist} title="쇼츠 모아보기">
              {heading}
            </ShortsPlayer>
          ) : (
            heading
          )}
        </header>
        <ul className="stories-gallery" aria-label="공개 이야기">
          {episodes.map((episode, index) => (
            <li key={episode.slug}>
              <Link className="stories-card" href={episodePath(episode.slug)} aria-label={episode.title}>
                {episode.image && (
                  <div className="stories-art">
                    <Image
                      src={episode.image}
                      alt=""
                      fill
                      sizes={
                        index === 0
                          ? '(max-width: 640px) calc(100vw - 42px), (max-width: 1240px) 46vw, 565px'
                          : '(max-width: 640px) 100px, (max-width: 1240px) 46vw, 565px'
                      }
                    />
                  </div>
                )}
                <div className="stories-caption">
                  <span className="story-topic" data-topic={episode.topic}>
                    {topics[episode.topic].label}
                  </span>
                  <h2>{episode.title}</h2>
                  <p>{episode.action}</p>
                  <ArrowUpRight aria-hidden size={19} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </>
  );
}
