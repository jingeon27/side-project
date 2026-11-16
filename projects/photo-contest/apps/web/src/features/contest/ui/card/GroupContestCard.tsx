'use client';

import { formatDateTime } from '@/shared/lib/format.helper';

import { useGroupContestCard } from './group-contest-card.hook';
import { GroupContestCardFrame } from './GroupContestCardFrame';
import { GroupContestCardLink } from './GroupContestCardLink';

/** 접수·투표 중인 그룹 대회 카드 */
export function GroupContestCard({ id }: { id: string }) {
  const fragment = useGroupContestCard(id);
  if (!fragment.complete) return null;
  return (
    <GroupContestCardFrame
      contest={fragment.data}
      schedule={`접수 마감 ${formatDateTime(fragment.data.submissionEndsAt)}`}
    >
      <p className="text-body text-muted">사진도 동영상도, 나만의 웃긴 순간으로 참여해 보세요.</p>
      <GroupContestCardLink contest={fragment.data}>대회 둘러보기</GroupContestCardLink>
    </GroupContestCardFrame>
  );
}
