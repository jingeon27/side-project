import { describe, expect, it } from 'vitest';

import { GroupRole, Phase } from '@/shared/api/generated';

import { canLeaveGroup, canRemoveMember, isGroupAdmin, isGroupOwner, splitContests } from './group.helper';

describe('멤버 내보내기·나가기 권한', () => {
  it('그룹장은 부관리자·멤버를, 부관리자는 일반 멤버만 내보내고 그룹장은 내보낼 수 없어야 한다', () => {
    expect(canRemoveMember(GroupRole.Owner, GroupRole.Moderator)).toBe(true);
    expect(canRemoveMember(GroupRole.Owner, GroupRole.Member)).toBe(true);
    expect(canRemoveMember(GroupRole.Moderator, GroupRole.Member)).toBe(true);
    expect(canRemoveMember(GroupRole.Moderator, GroupRole.Moderator)).toBe(false);
    for (const viewer of [GroupRole.Owner, GroupRole.Moderator, GroupRole.Member, null])
      expect(canRemoveMember(viewer, GroupRole.Owner)).toBe(false);
    expect(canRemoveMember(GroupRole.Member, GroupRole.Member)).toBe(false);
    expect(canRemoveMember(null, GroupRole.Member)).toBe(false);
  });

  it('그룹장이 아닌 멤버만 그룹을 나갈 수 있어야 한다', () => {
    expect(canLeaveGroup(GroupRole.Member)).toBe(true);
    expect(canLeaveGroup(GroupRole.Moderator)).toBe(true);
    expect(canLeaveGroup(GroupRole.Owner)).toBe(false);
    expect(canLeaveGroup(null)).toBe(false);
  });
});

describe('group.helper', () => {
  it('관리자만 그룹 주인으로 봐야 한다', () => {
    expect(isGroupOwner(GroupRole.Owner)).toBe(true);
    expect(isGroupOwner(GroupRole.Member)).toBe(false);
  });

  it('진행 중인 대회와 끝난 대회를 순서를 지켜 나눠야 한다', () => {
    const contests = [
      { id: 'a', phase: Phase.Voting },
      { id: 'b', phase: Phase.Completed },
      { id: 'c', phase: Phase.Upcoming },
      { id: 'd', phase: Phase.Submission },
      { id: 'e', phase: Phase.Completed },
    ];

    const { active, finished } = splitContests(contests);

    expect(active.map((contest) => contest.id)).toEqual(['a', 'c', 'd']);
    expect(finished.map((contest) => contest.id)).toEqual(['b', 'e']);
  });
  it('부관리자는 운영할 수 있지만 그룹장으로 취급하지 않아야 한다', () => {
    expect(isGroupAdmin(GroupRole.Owner)).toBe(true);
    expect(isGroupAdmin(GroupRole.Moderator)).toBe(true);
    expect(isGroupOwner(GroupRole.Moderator)).toBe(false);
    expect(isGroupAdmin(GroupRole.Member)).toBe(false);
    expect(isGroupAdmin(null)).toBe(false);
  });
});
