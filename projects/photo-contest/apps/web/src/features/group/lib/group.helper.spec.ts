import { describe, expect, it } from 'vitest';

import { GroupRole, Phase } from '@/shared/api/generated';

import { isGroupOwner, splitContests } from './group.helper';

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
});
