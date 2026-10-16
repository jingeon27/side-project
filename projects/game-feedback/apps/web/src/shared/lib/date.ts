import { translate, type TLocale } from '@/shared/i18n/index.server';
export function timeAgo(value: string, locale: TLocale = 'ko'): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return translate(locale, '방금 전');
  if (minutes < 60) return translate(locale, '{count}분 전', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return translate(locale, '{count}시간 전', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return translate(locale, '{count}일 전', { count: days });
  return new Date(value).toLocaleDateString(locale, { timeZone: 'Asia/Seoul' });
}
