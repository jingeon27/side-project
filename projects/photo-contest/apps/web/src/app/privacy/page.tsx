import type { Metadata } from 'next';

import { PrivacyPageTemplate } from '@/_pages/legal';

export const metadata: Metadata = { title: '개인정보 처리방침' };

export default function Page() {
  return <PrivacyPageTemplate />;
}
