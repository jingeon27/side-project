import { describe, expect, it } from 'vitest';

import { buildContestDefaults, createContestSchema } from './contest.schema';

const issuesOf = (input: Record<string, string>) => {
  const result = createContestSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => [issue.path.join('.'), issue.message]);
};

describe('createContestSchema', () => {
  it('기본값은 바로 제출할 수 있어야 하고 ISO 시각으로 바뀌어야 한다', () => {
    const defaults = {
      ...buildContestDefaults(new Date('2026-10-14T03:00:00.000Z')),
      title: ' 가을 사진전 ',
    };
    const result = createContestSchema.parse(defaults);
    expect(result).toEqual({
      title: '가을 사진전',
      startsAt: '2026-10-14T03:00:00.000Z',
      submissionEndsAt: '2026-10-17T03:00:00.000Z',
      endsAt: '2026-10-21T03:00:00.000Z',
    });
  });

  it('제목이 없으면 알려야 한다', () => {
    expect(issuesOf({ ...buildContestDefaults(new Date()), title: '   ' })).toEqual([
      ['title', '대회 제목을 입력해 주세요.'],
    ]);
  });

  it('시작 → 사진 마감 → 투표 마감 순서가 아니면 해당 칸에 알려야 한다', () => {
    expect(
      issuesOf({
        title: '대회',
        startsAt: '2026-10-14T12:00',
        submissionEndsAt: '2026-10-14T11:00',
        endsAt: '2026-10-14T10:00',
      }),
    ).toEqual([
      ['submissionEndsAt', '사진 제출 마감은 시작보다 뒤여야 해요.'],
      ['endsAt', '투표 마감은 사진 제출 마감보다 뒤여야 해요.'],
    ]);
  });

  it('90일을 넘기면 알려야 한다', () => {
    expect(
      issuesOf({
        title: '대회',
        startsAt: '2026-01-01T00:00',
        submissionEndsAt: '2026-02-01T00:00',
        endsAt: '2026-04-15T00:00',
      }),
    ).toEqual([['endsAt', '대회는 최대 90일 동안 진행할 수 있어요.']]);
  });

  it('비어 있는 시각은 칸마다 알려야 한다', () => {
    expect(issuesOf({ title: '대회', startsAt: '', submissionEndsAt: '', endsAt: '' })).toEqual([
      ['startsAt', '시작 시각을 입력해 주세요.'],
      ['submissionEndsAt', '사진 제출 마감을 입력해 주세요.'],
      ['endsAt', '투표 마감을 입력해 주세요.'],
    ]);
  });
});
