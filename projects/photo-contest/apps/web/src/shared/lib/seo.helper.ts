import type { Metadata } from 'next';

export const SITE_NAME = '별사대';
export const SITE_DESCRIPTION = '사진·동영상·합성으로 웃긴 순간을 함께 나누는 그룹 커뮤니티.';
export const PUBLIC_ROBOTS = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    'max-image-preview': 'large',
    'max-snippet': -1,
    'max-video-preview': -1,
  },
} as const;
export const PRIVATE_ROBOTS = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false, noimageindex: true },
} as const;

export function siteUrl(path: string, origin: string) {
  return new URL(path, origin).href;
}

export function createPageMetadata({
  origin,
  path,
  title,
  description,
  index = true,
  images = [siteUrl('/opengraph-image', origin)],
}: {
  origin: string;
  path: string;
  title: string;
  description: string;
  index?: boolean;
  images?: string[];
}): Metadata {
  const url = siteUrl(path, origin);
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: index ? PUBLIC_ROBOTS : PRIVATE_ROBOTS,
    openGraph: {
      type: 'website',
      locale: 'ko_KR',
      siteName: SITE_NAME,
      title: `${title} · ${SITE_NAME}`,
      description,
      url,
      images,
    },
    twitter: { card: 'summary_large_image', title: `${title} · ${SITE_NAME}`, description, images },
  };
}

export function serializeJsonLd(data: Record<string, unknown>) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
