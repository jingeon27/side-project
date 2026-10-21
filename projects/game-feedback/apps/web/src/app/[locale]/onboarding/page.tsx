import { Suspense } from 'react';

import { OnboardingRoute } from '@/_pages/onboarding/index.server';
import { staticPageMetadata } from '@/shared/seo';
import { LoadingState } from '@/shared/ui';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return staticPageMetadata('onboarding', (await params).locale);
}

export default function Page(props: Parameters<typeof OnboardingRoute>[0]) {
  return (
    <Suspense fallback={<LoadingState />}>
      <OnboardingRoute {...props} />
    </Suspense>
  );
}
