import { GroupRole, Phase } from '@/shared/api/generated';

/** 그룹 관리자(만든 사람)인지 */
export function isGroupOwner(role: GroupRole | null | undefined) {
  return role === GroupRole.Owner;
}

export function isGroupAdmin(role: GroupRole | null | undefined) {
  return isGroupOwner(role) || role === GroupRole.Moderator;
}

/** API 규칙과 같다: 그룹장은 누구도 내보낼 수 없고, 부관리자는 일반 멤버만, 그룹장은 부관리자도 내보낸다. */
export function canRemoveMember(viewerRole: GroupRole | null | undefined, memberRole: GroupRole) {
  if (memberRole === GroupRole.Owner) return false;
  if (isGroupOwner(viewerRole)) return true;
  return viewerRole === GroupRole.Moderator && memberRole === GroupRole.Member;
}

/** 그룹장은 관리자를 양도한 뒤에만 나갈 수 있다. */
export function canLeaveGroup(viewerRole: GroupRole | null | undefined) {
  return Boolean(viewerRole) && !isGroupOwner(viewerRole);
}

/** 진행 중(시작 전·제출·투표)과 끝난 대회로 나눈다. API가 최신순으로 주므로 순서는 그대로 둔다. */
export function splitContests<TContest extends { phase: Phase }>(contests: readonly TContest[]) {
  return {
    active: contests.filter((contest) => contest.phase !== Phase.Completed),
    finished: contests.filter((contest) => contest.phase === Phase.Completed),
  };
}
