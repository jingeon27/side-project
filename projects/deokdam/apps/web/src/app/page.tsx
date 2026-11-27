import Image from 'next/image';
import Link from 'next/link';
import { connection } from 'next/server';

import { ArrowRight, BookHeart, GraduationCap, HeartHandshake } from 'lucide-react';

import { ShortsPlayer } from '@/features/shorts/ShortsPlayer';
import { shortsPlaylist } from '@/features/shorts/source';
import { episodePath, episodes } from '@/shared/episodes';
import { topics, type TTopic } from '@/shared/topics';
import { ReadingLink } from '@/shared/ui/ReadingLink';
import { SiteFooter } from '@/shared/ui/SiteFooter';

const featured = episodes[0];
const topicIcons = { job: BookHeart, parent: HeartHandshake, admission: GraduationCap };
const topicOrder = ['job', 'parent', 'admission'] as const satisfies readonly TTopic[];
const channelShortsPlaylist = 'PLdR732KbVakE';

export default async function Home() {
  await connection();
  if (!featured) throw new Error('An episode is required for the home page');
  const playlist = shortsPlaylist(process.env.DEOKDAM_SHORTS_PLAYLIST_ID ?? channelShortsPlaylist);
  const storiesHeading = <h2 id="stories-title">이야기 속 오늘의 덕</h2>;
  return (
    <>
      <main id="main-content" className="home">
        <section className="site-width home-hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="label hero-kicker">사주와 오늘의 덕</p>
            <h1 id="hero-title">
              기다리는 하루에,
              <br />
              <span>작은 덕 하나</span>
            </h1>
            <p className="hero-summary">
              취업과 입시를 기다리는 동안, 사주로 마음을 살피고 오늘 해볼 일을 한 가지 골라요.
            </p>
            <div className="hero-actions">
              <ReadingLink surface="hero" className="action-link">
                내 사주 보기
              </ReadingLink>
              <Link className="plain-link" href={episodePath(featured.slug)}>
                오늘의 덕 열기
              </Link>
            </div>
          </div>
          <Link href={episodePath(featured.slug)} className="featured-story">
            <div className="feature-art">
              {featured.image && (
                <Image
                  src={featured.image}
                  alt=""
                  fill
                  sizes="(max-width: 760px) calc(100vw - 42px), (max-width: 1230px) 50vw, 595px"
                  loading="eager"
                />
              )}
            </div>
            <div className="feature-caption">
              <div className="feature-copy">
                <p className="label">덕담집 사주극장</p>
                <strong>{featured.title}</strong>
                <span>“{featured.hook}”</span>
              </div>
              <span className="feature-arrow">
                <ArrowRight size={20} aria-hidden />
              </span>
            </div>
          </Link>
        </section>
        <section className="site-width home-topics" aria-labelledby="topics-title">
          <h2 id="topics-title">요즘 어떤 마음인가요?</h2>
          <div className="topic-grid">
            {topicOrder.map((topic) => {
              const Icon = topicIcons[topic];
              return (
                <article key={topic} className="topic-card" data-topic={topic}>
                  <div className="topic-emblem">
                    <Icon size={23} strokeWidth={1.7} aria-hidden />
                  </div>
                  <div className="topic-copy">
                    <ReadingLink topic={topic} surface="topics" className="topic-link">
                      {topics[topic].label}
                    </ReadingLink>
                    <p>{topics[topic].description}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        <section className="story-list" id="stories" aria-labelledby="stories-title">
          <div className="site-width">
            {playlist ? (
              <ShortsPlayer source={playlist} title="쇼츠 모아보기">
                {storiesHeading}
              </ShortsPlayer>
            ) : (
              storiesHeading
            )}
            <div className="story-rows">
              {episodes.map((episode) => (
                <Link href={episodePath(episode.slug)} key={episode.slug} className="story-row">
                  <span className="story-image">
                    {episode.image && (
                      <Image src={episode.image} alt="" fill sizes="(max-width: 760px) 88px, 112px" />
                    )}
                  </span>
                  <span className="story-copy">
                    <span className="story-topic" data-topic={episode.topic}>
                      {topics[episode.topic].label}
                    </span>
                    <strong>{episode.title}</strong>
                    <span className="story-action">{episode.action}</span>
                  </span>
                  <ArrowRight size={18} aria-hidden />
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
