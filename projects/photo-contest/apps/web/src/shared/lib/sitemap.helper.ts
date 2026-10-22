const xml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export function sitemapIndex(urls: readonly string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<sitemap><loc>${xml(url)}</loc></sitemap>`).join('')}</sitemapindex>`;
}

export function sitemapDocument(urls: readonly string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${xml(url)}</loc></url>`).join('')}</urlset>`;
}

/** 사이트맵 색인이 나열하는 분할 파일 수 */
export function sitemapPageCount(itemCount: number, pageSize: number) {
  return Math.ceil(Math.max(itemCount, 0) / pageSize);
}

/** `0.xml` 같은 분할 파일 이름의 페이지 번호. 형식이 틀리면 null이다. */
export function parseSitemapFileName(fileName: string) {
  return /^(0|[1-9]\d{0,8})\.xml$/.test(fileName) ? Number(fileName.slice(0, -4)) : null;
}

export function sitemapResponse(body: string) {
  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
