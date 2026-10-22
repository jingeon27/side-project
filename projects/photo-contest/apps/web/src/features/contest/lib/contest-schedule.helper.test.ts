import { describe, expect, it } from 'vitest';

import { buildContestDefaults, createContestSchema } from '../model/contest.schema';
import { startNowIfPast } from './contest-schedule.helper';

describe('startNowIfPast', () => {
  it('시트를 연 뒤 분이 바뀌어도 기본 시작 시각은 제출 시각으로 보내야 한다', () => {
    const openedAt = new Date('2026-10-21T17:55:59.500Z');
    const submittedAt = new Date('2026-10-21T17:56:01.000Z');
    const values = createContestSchema.parse({ ...buildContestDefaults(openedAt), title: '웃음 대회' });
    expect(values.startsAt).toBe('2026-10-21T17:55:00.000Z');
    expect(startNowIfPast(values, submittedAt)).toEqual({ ...values, startsAt: submittedAt.toISOString() });
  });

  it('앞으로의 시작 시각은 그대로 둬야 한다', () => {
    const values = { title: '예약 대회', startsAt: '2026-10-22T09:00:00.000Z' };
    expect(startNowIfPast(values, new Date('2026-10-21T17:56:01.000Z'))).toBe(values);
  });
});
