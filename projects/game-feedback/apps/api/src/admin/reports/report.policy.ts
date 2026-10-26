import { match } from 'ts-pattern';

import { type THideContentDto } from './report-input.dto';

/** 숨김 해제나 댓글 숨김이 다른 콘텐츠의 알림까지 지우지 않도록 범위를 제한한다. */
export function hiddenNotificationScope({
  targetType,
  targetId,
  hidden,
}: Pick<THideContentDto, 'targetType' | 'targetId' | 'hidden'>) {
  if (!hidden) return null;
  return match(targetType)
    .with('POST', () => ({ postId: targetId }))
    .with('ANSWER', () => ({ answerId: targetId }))
    .with('COMMENT', () => null)
    .exhaustive();
}
