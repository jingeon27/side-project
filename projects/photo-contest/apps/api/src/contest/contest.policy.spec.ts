import { GraphQLError } from 'graphql';
import { describe, expect, it } from 'vitest';

import { contestDates, phase, PHASE } from './contest.policy';

const DAY_MS = 86_400_000;

describe('대회 정책', () => {
  const contest = {
    startsAt: new Date('2026-10-13T01:00:00Z'),
    submissionEndsAt: new Date('2026-10-14T01:00:00Z'),
    endsAt: new Date('2026-10-15T01:00:00Z'),
  };

  it('제출·투표 마감 경계에서 다음 단계로 전환해야 한다', () => {
    expect(phase(contest, new Date('2026-10-13T00:59:59Z'))).toBe(PHASE.UPCOMING);
    expect(phase(contest, contest.startsAt)).toBe(PHASE.SUBMISSION);
    expect(phase(contest, new Date(contest.submissionEndsAt.getTime() - 1))).toBe(PHASE.SUBMISSION);
    expect(phase(contest, contest.submissionEndsAt)).toBe(PHASE.VOTING);
    expect(phase(contest, new Date(contest.endsAt.getTime() - 1))).toBe(PHASE.VOTING);
    expect(phase(contest, contest.endsAt)).toBe(PHASE.COMPLETED);
  });

  it('올바른 일정은 Date로 바꿔 돌려줘야 한다', () => {
    const dates = contestDates(
      contest.startsAt.toISOString(),
      contest.submissionEndsAt,
      contest.endsAt.toISOString(),
      contest.startsAt,
    );
    expect(dates).toEqual(contest);
  });

  it('마감 순서가 잘못되거나 지난 시작 시각이면 거부해야 한다', () => {
    expect(() =>
      contestDates(contest.startsAt, contest.endsAt, contest.submissionEndsAt, contest.startsAt),
    ).toThrow(GraphQLError);
    expect(() => contestDates(contest.startsAt, contest.startsAt, contest.endsAt, contest.startsAt)).toThrow(
      '시작, 제출 마감, 투표 마감 순서로 90일 이내의 기간을 설정해 주세요.',
    );
    expect(() =>
      contestDates(contest.startsAt, contest.submissionEndsAt, contest.endsAt, contest.endsAt),
    ).toThrow();
  });

  it('막 지난 시작 시각은 1분까지 허용해야 한다', () => {
    const now = new Date(contest.startsAt.getTime() + 60_000);
    expect(() => contestDates(contest.startsAt, contest.submissionEndsAt, contest.endsAt, now)).not.toThrow();
    const late = new Date(contest.startsAt.getTime() + 60_001);
    expect(() => contestDates(contest.startsAt, contest.submissionEndsAt, contest.endsAt, late)).toThrow();
  });

  it('전체 기간이 90일을 넘으면 거부해야 한다', () => {
    const endsAt = new Date(contest.startsAt.getTime() + 90 * DAY_MS);
    expect(() =>
      contestDates(contest.startsAt, contest.submissionEndsAt, endsAt, contest.startsAt),
    ).not.toThrow();
    const tooLong = new Date(endsAt.getTime() + 1);
    expect(() =>
      contestDates(contest.startsAt, contest.submissionEndsAt, tooLong, contest.startsAt),
    ).toThrow();
  });

  it('날짜로 읽을 수 없는 값은 BAD_USER_INPUT으로 거부해야 한다', () => {
    try {
      contestDates('내일', contest.submissionEndsAt, contest.endsAt, contest.startsAt);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(GraphQLError);
      expect((error as GraphQLError).message).toBe('올바른 대회 시각을 입력해 주세요.');
      expect((error as GraphQLError).extensions.code).toBe('BAD_USER_INPUT');
    }
  });
});
