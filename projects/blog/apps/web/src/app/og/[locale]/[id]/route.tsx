import { ImageResponse } from 'next/og';

import { isLocale } from '@/i18n/routing';
import { getArticles } from '@/shared/article/lib/get-articles';
import { labels } from '@/shared/config/labels';

export async function GET(_request: Request, context: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await context.params;
  if (!isLocale(locale)) return new Response('Not found', { status: 404 });
  const article = getArticles(locale).find((entry) => entry.id === id);
  if (!article) return new Response('Not found', { status: 404 });
  return new ImageResponse(
    <div
      lang={locale}
      style={{
        width: '100%',
        height: '100%',
        background: '#ffffff',
        color: '#18181b',
        display: 'flex',
        flexDirection: 'column',
        padding: '74px',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ fontSize: 28 }}>{labels(locale).home.title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        <div style={{ fontSize: 24, color: '#52525b' }}>{labels(locale).categories[article.category]}</div>
        <div
          style={{
            display: 'flex',
            fontSize: article.title.length > 42 ? 54 : 68,
            fontWeight: 700,
            lineHeight: 1.3,
          }}
        >
          {article.title}
        </div>
      </div>
      <div style={{ fontSize: 24, color: '#52525b' }}>{article.publishedAt.slice(0, 10)}</div>
    </div>,
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
