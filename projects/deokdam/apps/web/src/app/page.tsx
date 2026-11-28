import Image from 'next/image';
import Link from 'next/link';

import { ArrowRight, BookHeart, GraduationCap, HeartHandshake } from 'lucide-react';

import { episodePath, episodes } from '@/shared/episodes';
import { publicMetadata, siteOrigin } from '@/shared/site';
import { topics, type TTopic } from '@/shared/topics';
import { ReadingLink } from '@/shared/ui/ReadingLink';
import { SiteFooter } from '@/shared/ui/SiteFooter';
import { StoriesLink } from '@/shared/ui/StoriesLink';

export const metadata = publicMetadata(
  '/',
  'AI 사주와 오늘의 덕담',
  '취업 준비와 대학 입시를 기다리는 하루, 생년월일로 사주를 읽고 나만의 덕담 엽서를 만들어 보세요.',
);
const website = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: '덕담집',
  url: siteOrigin + '/',
  inLanguage: 'ko',
};
const featured = episodes[0];
const topicIcons = { job: BookHeart, parent: HeartHandshake, admission: GraduationCap };
const topicOrder = ['job', 'parent', 'admission'] as const satisfies readonly TTopic[];

export default function Home() {
  if (!featured) throw new Error('An episode is required for the home page');
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }} />
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
              <StoriesLink surface="home" className="plain-link">
                이야기 전체보기
              </StoriesLink>
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
      </main>
      <SiteFooter />
    </>
  );
}
