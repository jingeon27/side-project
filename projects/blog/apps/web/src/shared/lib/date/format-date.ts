import dayjs from 'dayjs';

import type { Locale } from '@/shared/config/site';

import { parseContentDate } from './content-date';

export function formatDate(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  }).format(dayjs(parseContentDate(date)).toDate());
}
