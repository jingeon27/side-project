import { getArticles } from '@/entities/article/lib/get-articles';
import { isLocale, locales } from '@/i18n/routing';
import { createRss } from '@/shared/lib/seo/rss';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function GET(_request: Request, context: { params: Promise<{ locale: string }> }) {
  const { locale } = await context.params;
  if (!isLocale(locale)) return new Response('Not found', { status: 404 });
  return new Response(createRss(locale, getArticles(locale)), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
