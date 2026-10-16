/** 한국 시간의 달력 기준. 월말에도 UTC 일자가 아닌 KST 월을 사용한다. */
export function koreanMonth(now = new Date()) {
  const local = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1) - 9 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(year, month + 1, 1) - 9 * 60 * 60 * 1000);
  return { gte: start, lt: end };
}
