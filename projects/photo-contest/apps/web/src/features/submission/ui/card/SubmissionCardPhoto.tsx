'use client';

import Image from 'next/image';

import { Badge } from '@/shared/ui/@core/badge';

import { useSubmissionCard } from './submission-card.hook';

/** 사진은 쿠키로 인증하는 비공개 이미지라 Next 이미지 최적화를 거치지 않는다. */
export function SubmissionCardPhoto({
  isPriority = false,
}: {
  /** 첫 화면의 첫 장만 먼저 불러온다. */
  isPriority?: boolean;
}) {
  const card = useSubmissionCard();
  return (
    <div className="relative aspect-square bg-sunken">
      <Image
        src={card.submission.imageUrl}
        alt={card.submission.caption}
        fill
        unoptimized
        sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 400px"
        loading={isPriority ? 'eager' : 'lazy'}
        fetchPriority={isPriority ? 'high' : 'auto'}
        className="object-cover"
      />
      {card.submission.hidden ? (
        <Badge tone="danger" className="absolute top-3 right-3">
          숨겨진 사진
        </Badge>
      ) : null}
    </div>
  );
}
