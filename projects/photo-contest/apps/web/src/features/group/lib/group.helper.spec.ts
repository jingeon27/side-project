import { describe, expect, it } from 'vitest';

import { GroupRole, Phase } from '@/shared/api/generated';

import { isGroupAdmin, isGroupOwner, splitContests } from './group.helper';

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
