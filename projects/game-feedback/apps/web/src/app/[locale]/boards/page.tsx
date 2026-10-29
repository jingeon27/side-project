import { Suspense } from 'react';
import { redirect } from 'next/navigation';

import { appRoutes } from '@game-feedback/bridge';

import { LoadingState } from '@/shared/ui';

async function RouteContent({ params }: { params: Promise<{ locale: string }> }) {
  redirect(appRoutes.boards((await params).locale));
  return null;
}

export default function Page(props: Parameters<typeof RouteContent>[0]) {
  return (
    <Suspense fallback={<LoadingState />}>
      <RouteContent {...props} />
    </Suspense>
  );
}
