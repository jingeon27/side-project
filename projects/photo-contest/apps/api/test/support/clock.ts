import type { ITestApi } from './app';

const HOUR_MS = 60 * 60 * 1000;

export type TContestPhase = 'UPCOMING' | 'SUBMISSION' | 'VOTING' | 'COMPLETED';

// 단계는 서버 시각으로 계산하므로 시각을 기다리는 대신 격리 스키마의 일정을 옮긴다. 경계에서 흔들리지 않게 시간 단위로 둔다.
const SCHEDULE_HOURS: Record<TContestPhase, [number, number, number]> = {
  UPCOMING: [1, 2, 3],
  SUBMISSION: [-1, 1, 2],
  VOTING: [-2, -1, 1],
  COMPLETED: [-3, -2, -1],
};

/** 대회 일정을 옮겨 지금 시각이 phase에 속하게 한다. */
export async function moveContestTo(api: ITestApi, contestId: string, phase: TContestPhase) {
  const now = Date.now();
  const [startsAt, submissionEndsAt, endsAt] = SCHEDULE_HOURS[phase].map(
    (hours) => new Date(now + hours * HOUR_MS),
  );
  await api.db.contest.update({ where: { id: contestId }, data: { startsAt, submissionEndsAt, endsAt } });
}

/** 정렬·순위가 제출 시각에 기대는 테스트에서 시각을 고정한다. */
export async function setSubmittedAt(api: ITestApi, submissionId: string, createdAt: Date) {
  await api.db.submission.update({ where: { id: submissionId }, data: { createdAt } });
}

/** 기준 시각에서 minutes분 떨어진 시각 */
export function minutesFrom(base: Date, minutes: number) {
  return new Date(base.getTime() + minutes * 60 * 1000);
}
