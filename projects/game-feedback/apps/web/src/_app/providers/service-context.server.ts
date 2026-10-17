import 'server-only';
import { cacheLife } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { getServerSession } from '@/features/auth/index.server';
import { LANGUAGE_COOKIE, languagePreference, detectLocale } from '@/shared/i18n/index.server';
import { THEME_COOKIE, themePreference } from '@/shared/theme/index.server';

export async function serviceContext() {
  'use cache: private';
  cacheLife({ stale: 300 });
  const [initialSession, cookieStore, requestHeaders] = await Promise.all([
    getServerSession(),
    cookies(),
    headers(),
  ]);
  return {
    initialSession,
    theme: themePreference(cookieStore.get(THEME_COOKIE)?.value),
    language: languagePreference(cookieStore.get(LANGUAGE_COOKIE)?.value),
    automaticLocale: detectLocale(requestHeaders.get('accept-language')),
    navigation: requestHeaders.get('x-game-feedback-navigation') === '1',
  };
}
