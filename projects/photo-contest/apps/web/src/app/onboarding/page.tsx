import { OnboardingPageTemplate } from '@/_pages/onboarding';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import { MeDocument } from '@/shared/api/generated';

export default function Page() {
  return (
    <PreloadQuery query={MeDocument}>
      <OnboardingPageTemplate />
    </PreloadQuery>
  );
}
