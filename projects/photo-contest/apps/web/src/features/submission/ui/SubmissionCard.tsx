import Image from 'next/image';
import { useId } from 'react';
import type { ReactNode } from 'react';

import type { SubmissionCardFragment } from '@/shared/api/generated';
import { cn } from '@/shared/lib/cn.helper';
import { Avatar } from '@/shared/ui/@core/avatar';
import { Badge } from '@/shared/ui/@core/badge';

interface ISubmissionCardProps {
  submission: Pick<SubmissionCardFragment, 'caption' | 'imageUrl' | 'hidden' | 'author'>;
  viewerId: string;
  /** 첫 화면의 첫 장만 먼저 불러온다. */
  isPriority?: boolean;
  /** 결과 화면의 우승작. 카드를 강조하고 data-winner를 붙인다. */
  isWinner?: boolean;
  /** 사진 아래에 표시할 배지(순위 등) */
  badge?: ReactNode;
  /** 캡션 아래 숫자(득표수 등) */
  stats?: ReactNode;
  /** 좋아요·투표 버튼 줄 */
  actions?: ReactNode;
  /** 신고·숨기기·삭제 줄 */
  moderation?: ReactNode;
  header?: ReactNode;
}

/**
 * 사진 카드(전체 폭 1열). 사진은 쿠키로 인증하는 비공개 이미지라 Next 이미지 최적화를 거치지 않는다.
 * 기능 버튼은 화면이 기능 slice에서 골라 넣는다.
 */
export function SubmissionCard({
  submission,
  viewerId,
  isPriority = false,
  isWinner = false,
  badge,
  stats,
  actions,
  moderation,
  header,
}: ISubmissionCardProps) {
  const captionId = useId();
  const isMine = submission.author.id === viewerId;
  return (
    <article
      aria-labelledby={captionId}
      data-winner={isWinner || undefined}
      data-hidden={submission.hidden || undefined}
      className={cn(
        'overflow-hidden rounded-card border border-line bg-surface shadow-card',
        isWinner && 'border-2 border-gold shadow-sheet',
        submission.hidden && 'opacity-80',
      )}
    >
      {header}
      <div className="relative aspect-square bg-sunken">
        <Image
          src={submission.imageUrl}
          alt={submission.caption}
          fill
          unoptimized
          sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 400px"
          loading={isPriority ? 'eager' : 'lazy'}
          fetchPriority={isPriority ? 'high' : 'auto'}
          className="object-cover"
        />
        {submission.hidden ? (
          <Badge tone="danger" className="absolute top-3 right-3">
            숨겨진 사진
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 p-4">
        {badge ? <div className="flex flex-wrap items-center gap-1.5">{badge}</div> : null}
        <div className="flex flex-col gap-1.5">
          <h3 id={captionId} className="text-subtitle break-words text-ink">
            {submission.caption}
          </h3>
          <p className="flex items-center gap-2 text-caption text-muted">
            <Avatar name={submission.author.nickname} src={submission.author.avatar} size="sm" />
            <span className="line-clamp-1">
              {submission.author.nickname}
              {isMine ? ' · 내 사진' : ''}
            </span>
          </p>
        </div>
        {stats}
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        {moderation}
      </div>
    </article>
  );
}
