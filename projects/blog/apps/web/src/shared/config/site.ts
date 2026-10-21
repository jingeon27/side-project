export { locales, defaultLocale, isLocale, type Locale } from '@/i18n/routing';

export function resolveSiteUrl(value: string | undefined): URL {
  const url = new URL(value || 'http://localhost:3100');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('SITE_URL must be an absolute HTTP(S) URL without credentials.');
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

export const siteUrl = resolveSiteUrl(
  process.env.SITE_URL || (process.env.NODE_ENV === 'production' ? 'https://blog.bambyul.com' : undefined),
);
export const author = {
  name: '김진건',
  email: 'contact@bambyul.com',
  github: 'https://github.com/jingeon27',
} as const;

export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl).toString();
}
