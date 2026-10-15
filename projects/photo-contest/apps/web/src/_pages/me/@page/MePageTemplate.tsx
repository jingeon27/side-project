'use client';

import { LoginPanel, ViewerBoundary } from '@/features/auth';
import { ROUTES } from '@/shared/constants/routes';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';
import { BottomNav } from '@/widgets/bottom-nav';

import { MyProfile } from './profile/MyProfile';
import { MyGroupsSection } from './groups/MyGroupsSection';

export function MePageTemplate() {
  return (
    <div className="flex flex-1 flex-col">
      <TopAppBar title="마이페이지" />
      <div className="flex flex-1 flex-col gap-6 p-4 desktop:p-8">
        <ViewerBoundary
          guest={<LoginPanel nextPath={ROUTES.ME} />}
          fallback={<Skeleton className="h-32 w-full" />}
        >
          {(_viewerId, viewerRef) => (
            <div className="grid items-start gap-8 desktop:grid-cols-[320px_minmax(0,1fr)]">
              <MyProfile viewerRef={viewerRef} />
              <MyGroupsSection />
            </div>
          )}
        </ViewerBoundary>
      </div>
      <BottomNav />
    </div>
  );
}
