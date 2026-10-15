'use client';

import { LoginPanel, ViewerBoundary } from '@/features/auth';
import { Badge } from '@/shared/ui/@core/badge';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { BrandAppBar } from '@/shared/ui/@core/top-app-bar';
import { BottomNav } from '@/widgets/bottom-nav';

import { HomePhotoFeed } from './feed/HomePhotoFeed';

export function HomePageTemplate() {
  return (
    <div className="flex flex-1 flex-col">
      <BrandAppBar />
      <div className="flex flex-1 flex-col gap-8 px-4 py-6 desktop:px-8 desktop:py-8">
        <section className="flex flex-col gap-4 rounded-card bg-brand-soft p-5 desktop:flex-row desktop:items-center desktop:justify-between desktop:p-8">
          <div>
            <p className="text-micro text-brand">우리끼리 사진 대회</p>
            <h2 className="mt-2 text-title-lg text-ink desktop:text-display">친구끼리 웃긴 순간을 모아요</h2>
            <p className="mt-2 text-body text-muted">
              직접 찍은 사진도, 재치 있는 합성도. 같이 보고 웃으면 그걸로 충분해요.
            </p>
          </div>
          <Badge tone="accent" className="self-start desktop:self-center">
            합성도 환영
          </Badge>
        </section>
        <ViewerBoundary
          guest={
            <div className="mx-auto w-full max-w-app">
              <LoginPanel />
            </div>
          }
          fallback={<Skeleton className="h-32 w-full" />}
        >
          {(viewerId) => <HomePhotoFeed viewerId={viewerId} />}
        </ViewerBoundary>
      </div>
      <BottomNav />
    </div>
  );
}
