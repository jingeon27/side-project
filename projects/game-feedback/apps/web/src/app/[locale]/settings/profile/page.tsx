import { Suspense } from 'react';
import { locale as rootLocale } from 'next/root-params';

import { ProfileEditPage } from '@/_pages/profile-edit';
import { staticPageMetadata } from '@/shared/seo';
import { LoadingState } from '@/shared/ui';

async function RouteContent() {
  return <ProfileEditPage locale={await rootLocale()} />;
}

export async function generateMetadata() {
  return staticPageMetadata('profileEdit', await rootLocale());
}

export default function Page() {
  return (
    <Suspense fallback={<LoadingState />}>
      <RouteContent />
    </Suspense>
  );
}
