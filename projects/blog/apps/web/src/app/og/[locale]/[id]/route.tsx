import { ImageResponse } from 'next/og';
import { getArticles } from '@/entities/article/lib/get-articles';
import { isLocale } from '@/i18n/routing';

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
        background: '#f5f4ef',
        color: '#282724',
        display: 'flex',
        flexDirection: 'column',
        padding: '74px',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ fontSize: 24, letterSpacing: '4px' }}>JINGEON / ENGINEERING NOTES</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
        <div style={{ fontSize: 22, color: '#737747', textTransform: 'uppercase' }}>{article.category}</div>
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
      <div style={{ display: 'flex', fontSize: 22, justifyContent: 'space-between', color: '#706e64' }}>
        <span>Software Engineer</span>
        <span>
          {locale.toUpperCase()} · {article.publishedAt.slice(0, 10)}
        </span>
      </div>
    </div>,
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
