import type { Metadata } from 'next';

export const siteOrigin = 'https://deokdam.bambyul.com';

export function publicMetadata(path: string, title: string, description: string): Metadata {
  const url = new URL(path, siteOrigin).href;
  const fullTitle = title + ' | 덕담집';
  const image = {
    url: new URL('/images/cards/baek-beonjjae-jiwonseo.jpg', siteOrigin).href,
    width: 1200,
    height: 630,
    alt: '덕담집 사주극장, 백 번째 지원서 편',
  };
  return {
    title: { absolute: fullTitle },
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'ko_KR',
      siteName: '덕담집',
      url,
      title: fullTitle,
      description,
      images: [image],
    },
    twitter: { card: 'summary_large_image', title: fullTitle, description, images: [image] },
  };
}
