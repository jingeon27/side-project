import { connection } from 'next/server';

import { OnboardingPage } from '@/_pages/onboarding';
import { PreloadQuery } from '@/shared/api/apollo-client.server';
import { MeDocument } from '@/shared/api/generated';

export default async function Page() {
  await connection();
  return (
    <PreloadQuery query={MeDocument}>
      <OnboardingPage />
    </PreloadQuery>
  );
}
