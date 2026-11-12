import type { Locale } from '@/i18n/routing';

import en from '../../../messages/en.json';
import ko from '../../../messages/ko.json';

export function labels(locale: Locale) {
  return locale === 'ko' ? ko : en;
}
