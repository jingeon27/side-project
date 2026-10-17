import type { Metadata } from 'next';

import { TermsPageTemplate } from '@/_pages/legal';

export const metadata: Metadata = { title: '이용약관' };

export default function Page() {
  return <TermsPageTemplate />;
}
