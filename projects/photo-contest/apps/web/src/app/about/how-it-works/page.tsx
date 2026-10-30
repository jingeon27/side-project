import type { Metadata } from 'next';

import { HowItWorksPageTemplate } from '@/_pages/how-it-works';
import { getWebOrigin } from '@/shared/api/server-request.helper';
import { ROUTES } from '@/shared/constants/routes';
import { createPageMetadata } from '@/shared/lib/seo.helper';

export function generateMetadata(): Metadata {
  return createPageMetadata({
    origin: getWebOrigin(),
    path: ROUTES.HOW_IT_WORKS,
    title: '이용 방법',
    description: '그룹 찾기부터 사진·동영상 공유, 댓글과 대회까지. 피식에서 함께 웃는 방법을 알아보세요.',
  });
}

export default function Page() {
  return <HowItWorksPageTemplate />;
}
