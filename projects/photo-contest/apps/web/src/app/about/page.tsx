import type { Metadata } from 'next';

import { LandingPageTemplate } from '@/_pages/landing';
import { getWebOrigin } from '@/shared/api/server-request.helper';
import { ROUTES } from '@/shared/constants/routes';
import { createPageMetadata, SITE_DESCRIPTION, SITE_NAME, siteUrl } from '@/shared/lib/seo.helper';
import { JsonLd } from '@/shared/ui/@core/json-ld';

export function generateMetadata(): Metadata {
  return createPageMetadata({
    origin: getWebOrigin(),
    path: ROUTES.LANDING,
    title: SITE_NAME,
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
      <LandingPageTemplate />
    </>
  );
}
