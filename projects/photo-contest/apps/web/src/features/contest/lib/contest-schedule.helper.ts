import dayjs from 'dayjs';

/** 시작을 지금으로 당긴 뒤 접수 마감이 이미 지났을 때 접수 마감 칸에 보여 줄 안내 */
export const SUBMISSION_END_PASSED_MESSAGE = '마감 시각이 이미 지났어요. 지금보다 뒤로 정해 주세요.';

/**
 * 지난 시작 시각은 지금 시작으로 보낸다. 입력이 분 단위라 기본값 '지금'도 시트를 연 채 1분이 지나면
 * 서버의 시작 유예(1분)를 넘겨 거절된다.
 */
export function startNowIfPast<T extends { startsAt: string }>(values: T, now = dayjs().toDate()): T {
  if (dayjs(values.startsAt).valueOf() >= now.getTime()) return values;
  return { ...values, startsAt: now.toISOString() };
}

/**
 * startNowIfPast 뒤에도 시작 < 접수 마감인지. 스키마는 입력한 시작 시각으로만 순서를 보므로, 시트를 연 채
 * 접수 마감까지 지나면 서버가 거절하기 전에 그 칸에 알린다.
 */
export function hasSubmissionWindow({
  startsAt,
  submissionEndsAt,
}: {
  startsAt: string;
  submissionEndsAt: string;
}) {
  return dayjs(submissionEndsAt).valueOf() > dayjs(startsAt).valueOf();
}
