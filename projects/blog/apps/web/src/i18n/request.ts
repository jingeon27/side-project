import { getRequestConfig } from 'next-intl/server';

import { defaultLocale, isLocale } from './routing';

const messages = {
  ko: async () => (await import('../../messages/ko.json')).default,
  en: async () => (await import('../../messages/en.json')).default,
};

export default getRequestConfig(async ({ requestLocale }) => {
  const requestedLocale = await requestLocale;
  const locale = requestedLocale && isLocale(requestedLocale) ? requestedLocale : defaultLocale;
  return { locale, messages: await messages[locale](), timeZone: 'Asia/Seoul' };
});
