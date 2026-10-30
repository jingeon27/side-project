import Image from 'next/image';

import { Heart, MessageCircle, MoreHorizontal } from 'lucide-react';

import { StatusAnimation } from '@side/design-system';

import { BrandIcon } from '@/shared/ui/@core/top-app-bar';

/** 서비스 소개용 화면 예시. 실제 회원이나 반응 수로 보이지 않게 별도로 표시한다. */
export function FeedPreview() {
  return (
    <figure className="relative mx-auto w-full max-w-app">
      <div className="overflow-hidden rounded-sheet border border-line bg-surface shadow-sheet desktop:motion-safe:-rotate-3">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <span className="flex items-center gap-2 text-title font-extrabold text-ink">
            <BrandIcon className="size-7" />
            피식
          </span>
          <span className="rounded-full bg-sunken px-3 py-1 text-micro text-muted">화면 예시</span>
        </div>
        <div className="flex items-center gap-3 px-5 pt-5">
          <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-caption font-bold text-accent-ink">
            우
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-label text-ink">우리끼리 모은 순간</p>
            <p className="text-caption text-muted">사진 한 장이면 충분해요</p>
          </div>
          <MoreHorizontal aria-hidden className="size-5 text-muted" />
        </div>
        <p className="px-5 pt-4 pb-4 text-title text-ink">집에 오자마자 내 자리가 없어졌다</p>
        <StatusAnimation
          variant="cat"
          label="소파에 누운 고양이 일러스트"
          className="aspect-5/4 h-auto w-full"
          fallback={
            <Image
              src="/brand/afternoon-cat.svg"
              alt="노트북 옆 소파에 길게 누운 고양이 일러스트"
              width={1000}
              height={800}
              loading="eager"
              className="aspect-5/4 w-full object-cover"
            />
          }
        />
        <div className="flex gap-5 px-5 py-4 text-caption text-muted">
          <span className="flex items-center gap-2">
            <Heart aria-hidden className="size-5 text-danger" />
            좋아요
          </span>
          <span className="flex items-center gap-2">
            <MessageCircle aria-hidden className="size-5" />
            댓글
          </span>
        </div>
      </div>
      <figcaption className="mt-5 text-center text-caption text-muted">
        사진을 올리고, 댓글로 이어지는 우리 이야기.
      </figcaption>
    </figure>
  );
}
