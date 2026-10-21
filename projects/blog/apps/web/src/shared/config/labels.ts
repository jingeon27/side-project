import en from '../../../messages/en.json';
import ko from '../../../messages/ko.json';

export type UiLocale = 'ko' | 'en';
export function labels(locale: UiLocale) {
  return locale === 'ko' ? ko : en;
}
