'use client';

import { LoginPanel, ViewerBoundary } from '@/features/auth';
import { ROUTES } from '@/shared/constants/routes';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';
import { BottomNav } from '@/widgets/bottom-nav';

import { MyProfile } from './profile/MyProfile';

export function MePageTemplate() {
  return (
    <div className="flex flex-1 flex-col">
      <TopAppBar title="MY" />
      <div className="flex flex-1 flex-col gap-6 p-4">
        <ViewerBoundary
          guest={<LoginPanel nextPath={ROUTES.ME} />}
          fallback={<Skeleton className="h-32 w-full" />}
        >
          {(_viewerId, viewerRef) => <MyProfile viewerRef={viewerRef} />}
        </ViewerBoundary>
      </div>
      <BottomNav />
    </div>
  );
}
