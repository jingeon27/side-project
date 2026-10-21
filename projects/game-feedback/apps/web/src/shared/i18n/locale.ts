import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';

export const locales = ['ko', 'en', 'ja'] as const;
export type TLocale = (typeof locales)[number];
export type TLanguagePreference = TLocale | 'auto';
export const LANGUAGE_COOKIE = 'gf_language';
export const LOCALE_HEADER = 'x-game-feedback-locale';
export function isLocale(value: unknown): value is TLocale {
  return value === 'ko' || value === 'en' || value === 'ja';
}
export function languagePreference(value: unknown): TLanguagePreference {
  return isLocale(value) ? value : 'auto';
}
export function detectLocale(acceptLanguage: string | null | undefined): TLocale {
  const candidates = (acceptLanguage ?? '')
    .slice(0, 2048)
    .split(',')
    .map((part, index) => {
      const [tag = '', ...parameters] = part.trim().split(';');
      const quality = parameters.find((parameter) => parameter.trim().startsWith('q='));
      const weight = quality ? Number(quality.trim().slice(2)) : 1;
      return { locale: tag.toLowerCase().split('-')[0], weight, index };
    });
  const selected = candidates
    .filter((candidate) => Number.isFinite(candidate.weight) && candidate.weight > 0 && candidate.weight <= 1)
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .find((candidate) => isLocale(candidate.locale));
  return isLocale(selected?.locale) ? selected.locale : 'en';
}
export function preferredLocale(preference: unknown, acceptLanguage?: string | null): TLocale {
  return isLocale(preference) ? preference : detectLocale(acceptLanguage);
}
export function localePath(path: string, locale: TLocale): string {
  const authScreen = /^\/(ko|en|ja)\/(login|onboarding)(?:[/?]|$)/.exec(path)?.[2];
  if (authScreen === 'login' || authScreen === 'onboarding') {
    const route = resolveAppRoute(path);
    return appRoutes[authScreen](locale, localePath(route?.parent ?? appRoutes.feed(locale), locale));
  }
  return /^\/(ko|en|ja)(?=\/|\?|#|$)/.test(path)
    ? path.replace(/^\/(ko|en|ja)(?=\/|\?|#|$)/, `/${locale}`)
    : `/${locale}`;
}
