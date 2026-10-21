import { getRequestConfig } from 'next-intl/server';

import { defaultLocale, isLocale } from './routing';

const messages = {
  ko: () => import('../../messages/ko.json').then((module) => module.default),
  en: () => import('../../messages/en.json').then((module) => module.default),
};

export default getRequestConfig(async ({ requestLocale }) => {
  const requestedLocale = await requestLocale;
  const locale = requestedLocale && isLocale(requestedLocale) ? requestedLocale : defaultLocale;
  return { locale, messages: await messages[locale](), timeZone: 'Asia/Seoul' };
});
