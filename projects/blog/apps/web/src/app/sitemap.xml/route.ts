import { sitemapIndexXml } from '@/shared/lib/seo/locale-sitemap';

// Built from the generated article registry, so it only changes with a new build.
export const dynamic = 'force-static';

export function GET() {
  return new Response(sitemapIndexXml(), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
