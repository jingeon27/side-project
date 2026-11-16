import { describe, expect, it } from 'vitest';

import { createPageMetadata, serializeJsonLd } from './seo.helper';
import { sitemapDocument, sitemapIndex } from './sitemap.helper';

describe('SEO 출력', () => {
  it('사이트의 공개 origin으로 canonical·Open Graph·Twitter URL을 일치시켜야 한다', () => {
    const result = createPageMetadata({
      origin: 'https://moment.example',
      path: '/groups/group-1',
      title: '고양이',
      description: '함께 웃어요',
    });
    expect(result.alternates).toEqual({ canonical: 'https://moment.example/groups/group-1' });
    expect(result.openGraph).toMatchObject({
      url: 'https://moment.example/groups/group-1',
      locale: 'ko_KR',
      siteName: '피식',
    });
    expect(result.twitter).toMatchObject({
      card: 'summary_large_image',
      images: ['https://moment.example/opengraph-image'],
    });
    expect(result.robots).toMatchObject({ index: true, follow: true });
  });

  it('공유 제목은 문자열에만 서비스 이름을 붙이고 absolute 제목은 그대로 써야 한다', () => {
    const base = { origin: 'https://moment.example', path: '/', description: '소개' };
    const page = createPageMetadata({ ...base, title: '고양이' });
    expect(page.title).toBe('고양이');
    expect(page.openGraph).toMatchObject({ title: '고양이 | 피식' });
    expect(page.twitter).toMatchObject({ title: '고양이 | 피식' });

    const brand = createPageMetadata({ ...base, title: { absolute: '같이 보면 더 웃긴 피식' } });
    expect(brand.title).toEqual({ absolute: '같이 보면 더 웃긴 피식' });
    expect(brand.openGraph).toMatchObject({ title: '같이 보면 더 웃긴 피식' });
    expect(brand.twitter).toMatchObject({ title: '같이 보면 더 웃긴 피식' });
  });

  it('원본 사진에는 임의 크기를 붙이지 않고 생성 카드의 크기만 유지해야 한다', () => {
    const metadata = createPageMetadata({
      origin: 'https://moment.example',
      path: '/groups/group-1',
      title: '그룹',
      description: '소개',
      imageAlt: '그룹 사진',
      images: [
        'https://moment.example/backend/media/photo',
        { url: 'https://moment.example/og/groups/group-1', width: 1200, height: 630 },
      ],
    });
    expect(metadata.openGraph?.images).toEqual([
      { url: 'https://moment.example/backend/media/photo', alt: '그룹 사진' },
      { url: 'https://moment.example/og/groups/group-1', alt: '그룹 사진', width: 1200, height: 630 },
    ]);
    expect(metadata.twitter).toMatchObject({ images: metadata.openGraph?.images });
  });
  it('검색 제외 페이지는 Google 이미지 색인도 허용하지 않아야 한다', () => {
    expect(
      createPageMetadata({
        origin: 'https://moment.example',
        path: '/groups/private',
        title: '비공개',
        description: '',
        index: false,
      }).robots,
    ).toMatchObject({ index: false, follow: false, googleBot: { noimageindex: true } });
  });

  it('작성자의 문자열이 JSON-LD script를 닫지 못하면서 원문 JSON을 보존해야 한다', () => {
    const data = { '@context': 'https://schema.org', text: '</script><script>alert(1)</script>\u2028\u2029' };
    const serialized = serializeJsonLd(data);
    expect(serialized).not.toContain('<');
    expect(serialized).toContain('\\u003c/script>');
    expect(JSON.parse(serialized)).toEqual(data);
  });

  it('사이트맵의 URL·인덱스는 XML 특수 문자를 이스케이프하고 가짜 수정일을 만들지 않아야 한다', () => {
    const url = 'https://moment.example/?a=1&b=<unsafe>';
    expect(sitemapDocument([{ url }])).toContain(
      '<loc>https://moment.example/?a=1&amp;b=&lt;unsafe&gt;</loc>',
    );
    expect(sitemapIndex([url])).toContain('<sitemap><loc>');
    expect(sitemapDocument([{ url }])).not.toContain('<lastmod>');
  });

  it('확인된 수정 시각이 있는 URL에만 lastmod를 넣어야 한다', () => {
    const body = sitemapDocument([
      { url: 'https://moment.example/a', lastModified: '2026-10-20T01:02:03.000Z' },
      { url: 'https://moment.example/b' },
    ]);
    expect(body).toContain(
      '<url><loc>https://moment.example/a</loc><lastmod>2026-10-20T01:02:03.000Z</lastmod></url>',
    );
    expect(body).toContain('<url><loc>https://moment.example/b</loc></url>');
  });
});
