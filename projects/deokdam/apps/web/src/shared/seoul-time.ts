import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

export const seoulTimezone = 'Asia/Seoul';

export function seoulToday() {
  return dayjs().tz(seoulTimezone).format('YYYY-MM-DD');
}
