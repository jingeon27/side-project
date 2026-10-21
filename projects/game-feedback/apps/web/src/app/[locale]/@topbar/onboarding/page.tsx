import { Suspense } from 'react';
import { OnboardingTopbarRoute } from '@/_pages/onboarding/index.server';

export default function Page(props: Parameters<typeof OnboardingTopbarRoute>[0]) {
  return (
    <Suspense fallback={null}>
      <OnboardingTopbarRoute {...props} />
    </Suspense>
  );
}
