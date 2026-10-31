import dayjs from 'dayjs';
import { z } from 'zod';

import { fail } from '../common/errors';
import { CONTEST_MAX_DURATION_MS, CONTEST_START_GRACE_MS } from '../config/limits';

export const PHASE = {
  UPCOMING: 'UPCOMING',
  SUBMISSION: 'SUBMISSION',
  VOTING: 'VOTING',
  COMPLETED: 'COMPLETED',
} as const;

export type TPhase = (typeof PHASE)[keyof typeof PHASE];

export interface IContestSchedule {
  startsAt: Date;
  submissionEndsAt: Date;
  endsAt: Date;
}

const scheduleSchema = z.object({
  startsAt: z.coerce.date(),
  submissionEndsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
});

/** 단계는 저장하지 않고 서버 시각으로 계산한다. 마감 시각 자체는 다음 단계에 속한다. */
export function phase(contest: IContestSchedule, now = dayjs().toDate()): TPhase {
  if (now < contest.startsAt) return PHASE.UPCOMING;
  if (now < contest.submissionEndsAt) return PHASE.SUBMISSION;
  if (now < contest.endsAt) return PHASE.VOTING;
  return PHASE.COMPLETED;
}

/** 시작 < 제출 마감 < 투표 마감, 전체 90일 이내, 시작은 지금(1분 유예) 이후여야 한다. */
export function contestDates(
  startsAt: unknown,
  submissionEndsAt: unknown,
  endsAt: unknown,
  now = dayjs().toDate(),
): IContestSchedule {
  const parsed = scheduleSchema.safeParse({ startsAt, submissionEndsAt, endsAt });
  if (!parsed.success) fail('올바른 대회 시각을 입력해 주세요.');
  const dates = parsed.data;
  if (
    dates.startsAt.getTime() < now.getTime() - CONTEST_START_GRACE_MS ||
    dates.startsAt >= dates.submissionEndsAt ||
    dates.submissionEndsAt >= dates.endsAt ||
    dates.endsAt.getTime() - dates.startsAt.getTime() > CONTEST_MAX_DURATION_MS
  )
    fail('시작, 제출 마감, 투표 마감 순서로 90일 이내의 기간을 설정해 주세요.');
  return dates;
}
