'use client';

import { ArrowUpRight, ImagePlus, MessageCircle, Users } from 'lucide-react';

import { ROUTES } from '@/shared/constants/routes';
import { ButtonLink } from '@/shared/ui/@core/button';
import { PublicFooter, PublicHeader } from '@/widgets/public-layout';

import { FeedPreview } from './ui/FeedPreview';

export function LandingPageTemplate() {
  return (
    <div className="flex flex-1 flex-col bg-surface">
      <PublicHeader />
      <section className="overflow-hidden px-4 pt-12 pb-12 tablet:px-8 tablet:pt-20 tablet:pb-20">
        <div className="mx-auto grid max-w-7xl items-center gap-12 desktop:grid-cols-[1.1fr_1fr] desktop:gap-16">
          <div>
            <h1 className="text-hero text-ink">
              혼자 보기
              <br />
              아까운 순간<span className="text-accent">.</span>
            </h1>
            <p className="mt-6 max-w-app text-subtitle leading-relaxed text-muted">
              친구가 보낸 사진 한 장, 별거 아닌 이야기 하나. <br className="hidden tablet:block" />
              우리끼리 모으면 조금 더 웃긴 하루가 되니까.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={ROUTES.HOME} prefetch={false}>
                피식 시작하기 <ArrowUpRight aria-hidden className="size-4" />
              </ButtonLink>
              <ButtonLink href={ROUTES.HOW_IT_WORKS} variant="secondary">
                어떻게 쓰나요?
              </ButtonLink>
            </div>
            <p className="mt-4 text-caption text-muted">공개 그룹은 익명으로도 시작할 수 있어요.</p>
          </div>
          <div className="relative rounded-sheet bg-accent-soft px-5 py-8 tablet:px-10 tablet:py-10">
            <FeedPreview />
          </div>
        </div>
      </section>
      <section
        id="features"
        className="scroll-mt-24 border-y border-line bg-sunken px-4 py-12 tablet:px-8 tablet:py-20"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-display text-ink">
                잘 나온 사진보다,
                <br />
                같이 웃을 사진.
              </h2>
            </div>
            <p className="max-w-app text-body text-muted">
              사진과 동영상, 링크를 한곳에.
              <br />
              내가 고른 그룹의 이야기를 피드에서 이어서 봐요.
            </p>
          </div>
          <div className="grid gap-8 tablet:grid-cols-3 tablet:gap-10">
            <article className="border-t border-line-strong pt-6">
              <ImagePlus aria-hidden className="mb-5 size-7 text-accent-ink" />
              <h3 className="text-title text-ink">가볍게 올려요</h3>
              <p className="mt-3 text-body text-muted">
                직접 찍은 사진, 짧은 영상, 같이 보고 싶은 링크까지. 제목과 이야기를 더해 올려요.
              </p>
            </article>
            <article className="border-t border-line-strong pt-6">
              <Users aria-hidden className="mb-5 size-7 text-accent-ink" />
              <h3 className="text-title text-ink">우리끼리 모여요</h3>
              <p className="mt-3 text-body text-muted">
                공개 그룹에서 취향이 맞는 사람을 만나거나, 가입 승인이 필요한 비공개 그룹을 만들어요.
              </p>
            </article>
            <article className="border-t border-line-strong pt-6">
              <MessageCircle aria-hidden className="mb-5 size-7 text-accent-ink" />
              <h3 className="text-title text-ink">이야기가 이어져요</h3>
              <p className="mt-3 text-body text-muted">
                마음에 드는 순간에 좋아요를 남기고 댓글과 답글로 대화해요. 웃긴 순간이 우리 이야기가 돼요.
              </p>
            </article>
          </div>
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
