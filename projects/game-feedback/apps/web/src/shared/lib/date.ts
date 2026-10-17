import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { translate, type TLocale } from '@/shared/i18n/index.server';

dayjs.extend(utc);
dayjs.extend(timezone);
const displayTimeZone = 'Asia/Seoul';

export function formatDate(value: string, locale: TLocale = 'ko', options?: Intl.DateTimeFormatOptions) {
  return dayjs(value)
    .toDate()
    .toLocaleDateString(locale, { ...options, timeZone: displayTimeZone });
}

export function formatTime(value: string, locale: TLocale = 'ko') {
  return dayjs(value).toDate().toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: displayTimeZone,
  });
}

export function dateKey(value: string) {
  return dayjs(value).tz(displayTimeZone).format('YYYY-MM-DD');
}

export function isAtOrBefore(value: string, boundary: string | null) {
  return boundary !== null && dayjs(value).valueOf() <= dayjs(boundary).valueOf();
}

export function timeAgo(value: string, locale: TLocale = 'ko'): string {
  const minutes = Math.max(0, dayjs().diff(dayjs(value), 'minute'));
  if (minutes < 1) return translate(locale, '방금 전');
  if (minutes < 60) return translate(locale, '{count}분 전', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return translate(locale, '{count}시간 전', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return translate(locale, '{count}일 전', { count: days });
  return formatDate(value, locale);
}
