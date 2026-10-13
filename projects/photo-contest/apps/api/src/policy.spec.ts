import { describe, expect, it } from 'vitest';
import { contestDates, phase, textValue } from './policy';
describe('대회 정책', () => {
  const contest = {
    startsAt: new Date('2026-10-13T01:00:00Z'),
    submissionEndsAt: new Date('2026-10-14T01:00:00Z'),
    endsAt: new Date('2026-10-15T01:00:00Z'),
  };
  it('제출·투표 마감 경계에서 다음 단계로 전환해야 한다', () => {
    expect(phase(contest, new Date('2026-10-13T00:59:59Z'))).toBe('UPCOMING');
    expect(phase(contest, contest.startsAt)).toBe('SUBMISSION');
    expect(phase(contest, contest.submissionEndsAt)).toBe('VOTING');
    expect(phase(contest, contest.endsAt)).toBe('COMPLETED');
  });
  it('마감 순서가 잘못되거나 지난 시작 시각이면 거부해야 한다', () => {
    expect(() =>
      contestDates(contest.startsAt, contest.endsAt, contest.submissionEndsAt, contest.startsAt),
    ).toThrow();
    expect(() =>
      contestDates(contest.startsAt, contest.submissionEndsAt, contest.endsAt, contest.endsAt),
    ).toThrow();
  });
  it('공백뿐인 이름과 지나치게 긴 내용을 거부해야 한다', () => {
    expect(() => textValue('   ', 40, '이름')).toThrow();
    expect(() => textValue('a'.repeat(41), 40, '이름')).toThrow();
    expect(textValue('  친구들  ', 40, '이름')).toBe('친구들');
  });
});
