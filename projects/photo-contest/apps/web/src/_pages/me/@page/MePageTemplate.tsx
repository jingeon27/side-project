'use client';

import { Suspense } from 'react';

import { LoginPanel, ViewerBoundary } from '@/features/auth';
import { ROUTES } from '@/shared/constants/routes';
import { LegalLinks } from '@/shared/ui/@core/legal-links';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { ThemeSettings } from '@/shared/ui/@core/theme-settings';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';
import { BottomNav } from '@/widgets/bottom-nav';
import { NotificationBell } from '@/widgets/notification-bell';

import { MyGroupsSection } from './groups/MyGroupsSection';
import { MyPostsSection } from './posts/MyPostsSection';
import { MyProfile } from './profile/MyProfile';

export function MePageTemplate() {
  return (
    <div className="flex flex-1 flex-col">
      <TopAppBar title="마이페이지" actions={<NotificationBell />} />
      <div className="flex flex-1 flex-col gap-6 px-4 py-6 tablet:px-8 desktop:py-10">
        <ViewerBoundary
          guest={<LoginPanel nextPath={ROUTES.ME} />}
          fallback={<Skeleton className="h-32 w-full" />}
        >
          {(_viewerId, viewerRef) => (
            <div className="mx-auto grid w-full max-w-5xl desktop:max-w-none items-start gap-8 desktop:grid-cols-[240px_minmax(0,1fr)] wide:grid-cols-[280px_minmax(0,1fr)]">
              <div className="contents desktop:sticky desktop:top-24 desktop:flex desktop:flex-col desktop:gap-6">
                <MyProfile viewerRef={viewerRef} />
                <ThemeSettings />
                <div className="order-4 border-t border-line pt-4 desktop:border-0 desktop:pt-0">
                  <h2 className="text-label text-ink">서비스 안내</h2>
                  <LegalLinks />
                </div>
              </div>
              <div className="order-2 flex min-w-0 flex-col gap-10">
                <MyGroupsSection />
                <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                  <MyPostsSection />
                </Suspense>
              </div>
            </div>
          )}
        </ViewerBoundary>
      </div>
      <BottomNav />
    </div>
  );
}
