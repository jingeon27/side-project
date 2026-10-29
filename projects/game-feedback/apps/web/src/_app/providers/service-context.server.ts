import 'server-only';

import { cacheLife } from 'next/cache';
import { cookies, headers } from 'next/headers';

import { getServerSession } from '@/features/auth/index.server';
import { getPublicCategories } from '@/features/category/index.server';
import { detectLocale, LANGUAGE_COOKIE, languagePreference } from '@/shared/i18n/index.server';
import { THEME_COOKIE, themePreference } from '@/shared/theme/index.server';

export async function serviceContext() {
  'use cache: private';
  cacheLife({ stale: 300 });
  const [initialSession, initialCategories, cookieStore, requestHeaders] = await Promise.all([
    getServerSession(),
    getPublicCategories(),
    cookies(),
    headers(),
  ]);
  return {
    initialSession,
    initialCategories,
    theme: themePreference(cookieStore.get(THEME_COOKIE)?.value),
    language: languagePreference(cookieStore.get(LANGUAGE_COOKIE)?.value),
    automaticLocale: detectLocale(requestHeaders.get('accept-language')),
    navigation: requestHeaders.get('x-game-feedback-navigation') === '1',
  };
}
