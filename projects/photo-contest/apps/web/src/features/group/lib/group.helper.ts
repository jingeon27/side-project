import { GroupRole, Phase } from '@/shared/api/generated';

/** 그룹 관리자(만든 사람)인지 */
export function isGroupOwner(role: GroupRole) {
  return role === GroupRole.Owner;
}

/** 진행 중(시작 전·제출·투표)과 끝난 대회로 나눈다. API가 최신순으로 주므로 순서는 그대로 둔다. */
export function splitContests<TContest extends { phase: Phase }>(contests: readonly TContest[]) {
  return {
    active: contests.filter((contest) => contest.phase !== Phase.Completed),
    finished: contests.filter((contest) => contest.phase === Phase.Completed),
  };
}
