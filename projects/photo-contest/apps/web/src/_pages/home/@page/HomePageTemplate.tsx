'use client';

import { LoginPanel, ViewerBoundary } from '@/features/auth';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { BrandAppBar } from '@/shared/ui/@core/top-app-bar';
import { BottomNav } from '@/widgets/bottom-nav';

import { MyGroupsSection } from './groups/MyGroupsSection';

export function HomePageTemplate() {
  return (
    <div className="flex flex-1 flex-col">
      <BrandAppBar />
      <div className="flex flex-1 flex-col gap-6 px-4 py-6">
        <section className="rounded-card bg-brand-soft p-5">
          <p className="text-micro text-brand">우리끼리 사진 대회</p>
          <h2 className="mt-2 text-title-lg text-ink">친구끼리 웃긴 순간을 모아요</h2>
          <p className="mt-2 text-body text-muted">
            한 사람 한 장, 한 사람 한 표. 우리만의 최고의 순간을 뽑아보세요.
          </p>
        </section>
        <ViewerBoundary guest={<LoginPanel />} fallback={<Skeleton className="h-32 w-full" />}>
          {(_viewerId, viewerRef) => <MyGroupsSection viewerRef={viewerRef} />}
        </ViewerBoundary>
      </div>
      <BottomNav />
    </div>
  );
}
