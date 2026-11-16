import type { Metadata } from 'next';

import { LandingPage } from '@/_pages/landing';
import { getWebOrigin } from '@/shared/api/server-request.helper';
import { ROUTES } from '@/shared/constants/routes';
import { createPageMetadata, SITE_DESCRIPTION, SITE_NAME, siteUrl } from '@/shared/lib/seo.helper';
import { JsonLd } from '@/shared/ui/@core/json-ld';

export function generateMetadata(): Metadata {
  return createPageMetadata({
    origin: getWebOrigin(),
    path: ROUTES.LANDING,
    title: '서비스 소개',
    description: SITE_DESCRIPTION,
  });
}

export default function Page() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          '@id': siteUrl('/#website', getWebOrigin()),
          name: SITE_NAME,
          url: siteUrl(ROUTES.LANDING, getWebOrigin()),
          inLanguage: 'ko-KR',
        }}
      />
      <LandingPage />
    </>
  );
}
