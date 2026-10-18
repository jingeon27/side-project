import { Suspense } from 'react';
import { LoadingState } from '@/shared/ui';
import { redirect } from 'next/navigation';
import { appRoutes } from '@game-feedback/bridge';
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
