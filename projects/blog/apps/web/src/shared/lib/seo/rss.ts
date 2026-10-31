import dayjs from 'dayjs';

import type { Locale } from '@/i18n/routing';
import { labels } from '@/shared/config/labels';
import { absoluteUrl } from '@/shared/config/site';
import { parseContentDate } from '@/shared/lib/date/content-date';

import { articlePath, type ArticleSeo } from './metadata';

export function escapeXml(value: string): string {
  return value.replace(
    /[<>&"']/g,
    (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!,
  );
}

export function createRss(locale: Locale, articles: readonly ArticleSeo[]): string {
  const { title, description } = labels(locale).home;
  const items = articles
    .filter((article) => article.locale === locale)
    .map((article) => {
      const url = escapeXml(absoluteUrl(articlePath(locale, article.slug)));
      return `<item><title>${escapeXml(article.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><description>${escapeXml(article.description)}</description><pubDate>${dayjs(parseContentDate(article.publishedAt)).toDate().toUTCString()}</pubDate>${article.tags.map((tag) => `<category>${escapeXml(tag)}</category>`).join('')}</item>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${escapeXml(title)}</title><link>${escapeXml(absoluteUrl(`/${locale}`))}</link><description>${escapeXml(description)}</description><language>${locale}</language><atom:link href="${escapeXml(absoluteUrl(`/rss/${locale}`))}" rel="self" type="application/rss+xml"/>${items}</channel></rss>`;
}
