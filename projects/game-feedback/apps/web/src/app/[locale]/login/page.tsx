import { Suspense } from 'react';
import { LoginRoute } from '@/_pages/login/index.server';
import { LoadingState } from '@/shared/ui';
import { staticPageMetadata } from '@/shared/seo';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return staticPageMetadata('login', (await params).locale);
}
export default function Page(props: Parameters<typeof LoginRoute>[0]) {
  return (
    <Suspense fallback={<LoadingState />}>
      <LoginRoute {...props} />
    </Suspense>
  );
}
