import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

/** 한국 시간의 달력 기준. 월말에도 UTC 일자가 아닌 KST 월을 사용한다. */
export function koreanMonth(now = dayjs().toDate()) {
  const start = dayjs(now)
    .utcOffset(9 * 60)
    .startOf('month');
  return { gte: start.toDate(), lt: start.add(1, 'month').toDate() };
}
