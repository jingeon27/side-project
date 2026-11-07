'use client';

import { Avatar } from '@/shared/ui/@core/avatar';

import { useSubmissionCard } from './submission-card.hook';

/** 캡션은 카드의 이름이고, 아래에 작성자와 내 사진 여부를 함께 보여 준다. */
export function SubmissionCardCaption({ viewerId }: { viewerId: string }) {
  const card = useSubmissionCard();
  return (
    <div className="flex flex-col gap-1.5">
      <h3 id={card.captionId} className="text-subtitle break-words text-ink">
        {card.submission.caption}
      </h3>
      <p className="flex items-center gap-2 text-caption text-muted">
        <Avatar name={card.submission.author.nickname} src={card.submission.author.avatar} size="sm" />
        <span className="line-clamp-1">
          {card.submission.author.nickname}
          {card.submission.author.id === viewerId ? ' (내 사진)' : ''}
        </span>
      </p>
    </div>
  );
}
