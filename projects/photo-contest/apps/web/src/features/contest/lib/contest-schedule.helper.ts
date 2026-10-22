/**
 * 지난 시작 시각은 지금 시작으로 보낸다. 입력이 분 단위라 기본값 '지금'도 시트를 연 채 1분이 지나면
 * 서버의 시작 유예(1분)를 넘겨 거절된다.
 */
export function startNowIfPast<T extends { startsAt: string }>(values: T, now = new Date()): T {
  if (Date.parse(values.startsAt) >= now.getTime()) return values;
  return { ...values, startsAt: now.toISOString() };
}
