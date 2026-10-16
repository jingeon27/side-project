import type { Locale } from '@/i18n/routing';
import { absoluteUrl } from '@/shared/config/site';
import { articlePath, type ArticleSeo } from './metadata';

export function escapeXml(value: string): string {
  return value.replace(
    /[<>&"']/g,
    (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!,
  );
}

export function createRss(locale: Locale, articles: readonly ArticleSeo[]): string {
  const title = locale === 'ko' ? 'Engineering Blog — 한국어' : 'Engineering Blog — English';
  const description =
    locale === 'ko'
      ? '소프트웨어 엔지니어의 개발 경험과 생각'
      : 'Notes on software engineering and learning.';
  const items = articles
    .filter((article) => article.locale === locale)
    .map((article) => {
      const url = escapeXml(absoluteUrl(articlePath(locale, article.slug)));
      return `<item><title>${escapeXml(article.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><description>${escapeXml(article.description)}</description><pubDate>${new Date(article.publishedAt).toUTCString()}</pubDate>${article.tags.map((tag) => `<category>${escapeXml(tag)}</category>`).join('')}</item>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${escapeXml(title)}</title><link>${escapeXml(absoluteUrl(`/${locale}`))}</link><description>${escapeXml(description)}</description><language>${locale}</language><atom:link href="${escapeXml(absoluteUrl(`/rss/${locale}`))}" rel="self" type="application/rss+xml"/>${items}</channel></rss>`;
}
