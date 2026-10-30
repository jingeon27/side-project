'use client';

import { ArrowUpRight } from 'lucide-react';

import { ROUTES } from '@/shared/constants/routes';
import { ButtonLink } from '@/shared/ui/@core/button';
import { PublicFooter, PublicHeader } from '@/widgets/public-layout';

export function HowItWorksPageTemplate() {
  return (
    <div className="flex flex-1 flex-col bg-surface">
      <PublicHeader />
      <div className="w-full flex-1 px-4 py-12 tablet:px-8 tablet:py-20">
        <div className="mx-auto w-full max-w-7xl">
          <header className="max-w-3xl">
            <h1 className="text-hero text-ink">
              우리끼리,
              <br />
              이렇게 피식.
            </h1>
            <p className="mt-6 text-subtitle text-muted">
              그룹 하나, 사진 한 장부터.
              <br />
              같이 웃을 사람과 순간을 모아보세요.
            </p>
          </header>
          <section aria-label="피식 시작 순서" className="mt-12 grid gap-8 tablet:mt-16 tablet:grid-cols-3">
            <article className="border-t border-line-strong pt-6">
              <span className="text-micro text-accent-ink">01</span>
              <h2 className="mt-4 text-title-lg text-ink">취향이 맞는 그룹 찾기</h2>
              <p className="mt-3 text-body text-muted">
                익명으로 시작하거나 회원가입한 뒤 탐색에서 그룹을 찾아요. 친구들과 쓸 그룹을 직접 만들 수도
                있어요.
              </p>
            </article>
            <article className="border-t border-line-strong pt-6">
              <span className="text-micro text-accent-ink">02</span>
              <h2 className="mt-4 text-title-lg text-ink">사진과 영상, 링크 올리기</h2>
              <p className="mt-3 text-body text-muted">
                그룹에 가입했다면 글쓰기를 눌러 올려요. 짧은 제목과 이야기를 더하고, 대회가 열려 있다면 함께
                참여해요.
              </p>
            </article>
            <article className="border-t border-line-strong pt-6">
              <span className="text-micro text-accent-ink">03</span>
              <h2 className="mt-4 text-title-lg text-ink">좋아요와 댓글로 이어가기</h2>
              <p className="mt-3 text-body text-muted">
                가입한 그룹의 새 글을 피드에서 모아봐요. 마음에 들면 좋아요를 누르고 댓글로 이야기를 이어가요.
              </p>
            </article>
          </section>
          <section aria-label="그룹 공개 범위" className="mt-16 border-y border-line py-8 tablet:py-12">
            <h2 className="text-display text-ink">어떤 그룹이 좋을까요?</h2>
            <div className="mt-7 grid gap-8 tablet:grid-cols-2 tablet:gap-12">
              <article className="max-w-app">
                <h3 className="text-title text-ink">취향이 통하는 공개 그룹</h3>
                <p className="mt-3 text-body text-muted">
                  익명으로도 내용을 보고 바로 가입할 수 있어요. 좋아하는 주제로 새로운 사람들과 나누기 좋아요.
                </p>
              </article>
              <article className="max-w-app">
                <h3 className="text-title text-ink">우리끼리 쓰는 비공개 그룹</h3>
                <p className="mt-3 text-body text-muted">
                  로그인하고 가입을 신청해요. 관리자가 수락한 멤버만 게시물을 볼 수 있고, 초대 링크로 들어와도
                  승인이 필요해요.
                </p>
              </article>
            </div>
          </section>
          <section className="mt-16 grid gap-8 tablet:grid-cols-[1fr_1.2fr]">
            <div>
              <h2 className="text-display text-ink">
                시작 전에,
                <br />
                이것만 알아두세요.
              </h2>
            </div>
            <dl className="divide-y divide-line">
              <div className="pb-5">
                <dt className="text-subtitle text-ink">대회에 꼭 참여해야 하나요?</dt>
                <dd className="mt-2 text-body text-muted">
                  평소에는 일반 게시물을 올리면 돼요. 그룹 대회는 원할 때 참여하고, 사진과 동영상으로 여러 번
                  참여할 수 있어요.
                </dd>
              </div>
              <div className="py-5">
                <dt className="text-subtitle text-ink">익명으로도 대회 투표를 할 수 있나요?</dt>
                <dd className="mt-2 text-body text-muted">
                  대회 투표에는 회원 로그인이 필요해요. 투표는 대회마다 한 번, 본인 참여작을 제외하고 할 수
                  있어요.
                </dd>
              </div>
              <div className="pt-5">
                <dt className="text-subtitle text-ink">그룹은 대회가 끝나면 없어지나요?</dt>
                <dd className="mt-2 text-body text-muted">
                  그룹은 계속 유지돼요. 지난 대회의 결과는 명예의 전당에 남고, 새 게시물과 대회를 이어갈 수
                  있어요.
                </dd>
              </div>
            </dl>
          </section>
          <div className="mt-16 flex flex-wrap items-center justify-between gap-6 border-t border-line pt-8">
            <p className="text-body text-muted">공개 그룹은 익명으로 시작할 수 있어요.</p>
            <ButtonLink href={ROUTES.HOME} prefetch={false}>
              피식 시작하기 <ArrowUpRight aria-hidden className="size-4" />
            </ButtonLink>
          </div>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
