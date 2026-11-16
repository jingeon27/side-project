import Link from 'next/link';

import { ArrowDown, ArrowUpRight, Film, MessagesSquare, Route, type LucideIcon } from 'lucide-react';

import { appRoutes } from '@game-feedback/bridge';

import { gameBoards } from '@/features/board';
import { InteractionTracker } from '@/shared/analytics';
import { getContactEmail } from '@/shared/config';
import { GameMateLogo } from '@/shared/ui';

import { LandingHeader } from './LandingHeader';
import { LandingStartLink } from './LandingStartLink';

const steps = [
  {
    title: '플레이를 보여주세요',
    description:
      '궁금한 장면과 덱, 고민을 글로 남겨요. 사진과 동영상을 함께 올리면 상황을 더 쉽게 전할 수 있어요.',
    icon: Film,
  },
  {
    title: '다른 시선을 만나보세요',
    description:
      '다른 플레이어의 답변을 읽고 내 플레이와 비교해요. 도움이 된 피드백에는 도움됨을 남겨주세요.',
    icon: Route,
  },
  {
    title: '대화를 이어가세요',
    description: '댓글로 더 물어보거나 1:1 채팅으로 이야기해요. 함께 연습할 상대와 코치도 찾아볼 수 있어요.',
    icon: MessagesSquare,
  },
] as const satisfies readonly { title: string; description: string; icon: LucideIcon }[];

export function LandingPage() {
  return (
    <div className="landing-page">
      <InteractionTracker />
      <a href="#landing-main" className="landing-skip-link">
        본문으로 건너뛰기
      </a>
      <LandingHeader />
      <main id="landing-main">
        <section className="landing-container landing-hero" aria-label="Game Mate 소개">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">플레이어와 플레이어 사이, Game Mate</p>
            <h1>
              혼자 막힌 플레이,
              <br />
              함께 풀어봐요.
            </h1>
            <p className="landing-lead">
              덱을 바꿔볼까, 이 장면은 어떻게 풀까. <br className="hidden tablet:block" />
              플레이를 나누고 함께할 사람을 만나요.
            </p>
            <div className="landing-hero-actions">
              <LandingStartLink placement="hero" />
              <a href="#how-it-works" className="landing-text-link" data-analytics-action="landing-guide">
                어떤 곳인가요? <ArrowDown aria-hidden className="size-4" />
              </a>
            </div>
            <p className="landing-hint">게시글은 로그인 없이 둘러볼 수 있어요.</p>
          </div>
          <aside className="landing-directory" aria-labelledby="landing-directory-title">
            <div className="landing-directory-heading">
              <span className="landing-directory-rule" aria-hidden />
              <h2 id="landing-directory-title">지금 필요한 이야기로</h2>
            </div>
            <div>
              {gameBoards.map((board, index) => (
                <Link
                  key={board.kind}
                  href={appRoutes.boards('ko', board.slug)}
                  prefetch={false}
                  className="landing-board-link"
                  data-analytics-action={`landing-board-${board.slug}`}
                >
                  <span className="landing-board-number" aria-hidden>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3>{board.name}</h3>
                    <p>{board.description}</p>
                  </div>
                  <ArrowUpRight aria-hidden className="size-5 shrink-0" />
                </Link>
              ))}
            </div>
          </aside>
        </section>

        <section id="how-it-works" className="landing-how" aria-labelledby="landing-how-title">
          <div className="landing-container">
            <div className="landing-section-heading">
              <p className="landing-eyebrow">답변 하나에서 다음 플레이로</p>
              <h2 id="landing-how-title">그 장면, 같이 이야기해요.</h2>
            </div>
            <div className="landing-steps">
              {steps.map(({ title, description, icon: Icon }) => (
                <article key={title}>
                  <Icon aria-hidden className="size-7 text-accent-ink" strokeWidth={1.5} />
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-container landing-invitation" aria-labelledby="landing-invitation-title">
          <div>
            <h2 id="landing-invitation-title">다음 플레이는, 함께.</h2>
            <p>어떤 이야기가 오가는지 먼저 둘러보세요.</p>
          </div>
          <LandingStartLink placement="footer" />
        </section>
      </main>
      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <div>
            <GameMateLogo />
            <p>© Game Mate</p>
          </div>
          <nav aria-label="서비스 정책">
            <Link href={appRoutes.guide('ko')} prefetch={false}>
              이용 가이드
            </Link>
            <Link href={appRoutes.terms('ko')} prefetch={false}>
              서비스 이용약관
            </Link>
            <Link href={appRoutes.privacy('ko')} prefetch={false}>
              개인정보 처리방침
            </Link>
            <a href={`mailto:${getContactEmail()}`}>문의</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
