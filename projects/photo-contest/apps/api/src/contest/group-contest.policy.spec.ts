import { describe, expect, it } from 'vitest';
import { assertContestParticipation } from './group-contest.policy';

describe('게시물의 대회 참여', () => {
  const contest = {
    format: 'POST',
    groupId: 'group',
    startsAt: new Date('2026-10-19T00:00:00Z'),
    submissionEndsAt: new Date('2026-10-20T00:00:00Z'),
    endsAt: new Date('2026-10-21T00:00:00Z'),
  };
  it('같은 그룹의 접수 기간 시작 시각부터 참여해야 한다', () => {
    expect(() => assertContestParticipation(contest, 'group', contest.startsAt)).not.toThrow();
  });
  it.each(['2026-10-18T23:59:59Z', '2026-10-20T00:00:00Z', '2026-10-21T00:00:00Z'])(
    '%s에는 참여할 수 없어야 한다',
    (time) => {
      expect(() => assertContestParticipation(contest, 'group', new Date(time))).toThrow(
        '게시물을 접수 중인 대회만 참여할 수 있습니다.',
      );
    },
  );
  it.each([
    { ...contest, groupId: 'other' },
    { ...contest, format: 'LEGACY' },
  ])('다른 그룹·이전 형식의 대회 참여를 막아야 한다', (entry) => {
    expect(() => assertContestParticipation(entry, 'group', contest.startsAt)).toThrow(
      '이 그룹에서 참여할 수 있는 대회를 선택해 주세요.',
    );
  });
});
