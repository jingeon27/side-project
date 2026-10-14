import { z } from 'zod';

import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/shared/lib/format.helper';

const DAY = 24 * 60 * 60_000;
/** API가 허용하는 최대 대회 기간 */
const MAX_CONTEST_DAYS = 90;

const dateTimeField = (message: string) =>
  z.string().refine((value) => fromDateTimeLocalValue(value) !== null, message);

/**
 * 대회 열기. 입력은 `<input type="datetime-local">` 값(기기 시간대)이고, 제출 값은 서버에 보낼 ISO 시각이다.
 * 시작 → 사진 마감 → 투표 마감 순서와 90일 한도는 서버도 검사하지만 입력 중에 먼저 알려 준다.
 */
export const createContestSchema = z
  .object({
    title: z.string().trim().min(1, '대회 제목을 입력해 주세요.').max(80, '80자 이내로 입력해 주세요.'),
    startsAt: dateTimeField('시작 시각을 입력해 주세요.'),
    submissionEndsAt: dateTimeField('사진 제출 마감을 입력해 주세요.'),
    endsAt: dateTimeField('투표 마감을 입력해 주세요.'),
  })
  .transform((value, context) => {
    const startsAt = fromDateTimeLocalValue(value.startsAt) ?? '';
    const submissionEndsAt = fromDateTimeLocalValue(value.submissionEndsAt) ?? '';
    const endsAt = fromDateTimeLocalValue(value.endsAt) ?? '';
    const start = Date.parse(startsAt);
    const submissionEnd = Date.parse(submissionEndsAt);
    const end = Date.parse(endsAt);
    if (!(submissionEnd > start))
      context.addIssue({
        code: 'custom',
        path: ['submissionEndsAt'],
        message: '사진 제출 마감은 시작보다 뒤여야 해요.',
      });
    if (!(end > submissionEnd))
      context.addIssue({ code: 'custom', path: ['endsAt'], message: '투표 마감은 사진 제출 마감보다 뒤여야 해요.' });
    else if (end - start > MAX_CONTEST_DAYS * DAY)
      context.addIssue({ code: 'custom', path: ['endsAt'], message: '대회는 최대 90일 동안 진행할 수 있어요.' });
    return { title: value.title, startsAt, submissionEndsAt, endsAt };
  });

export type TCreateContestInput = z.input<typeof createContestSchema>;

/** 시트를 열 때의 기본값: 지금 시작, 3일 뒤 사진 마감, 7일 뒤 투표 마감 */
export function buildContestDefaults(now: Date): TCreateContestInput {
  return {
    title: '',
    startsAt: toDateTimeLocalValue(now),
    submissionEndsAt: toDateTimeLocalValue(new Date(now.getTime() + 3 * DAY)),
    endsAt: toDateTimeLocalValue(new Date(now.getTime() + 7 * DAY)),
  };
}
