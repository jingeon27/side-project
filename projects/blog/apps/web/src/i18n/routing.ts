import { defineRouting } from 'next-intl/routing';

export const locales = ['ko', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ko';

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
  // Article alternates depend on content IDs and are supplied by Metadata.
  alternateLinks: false,
});
