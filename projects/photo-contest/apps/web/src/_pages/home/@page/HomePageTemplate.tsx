'use client';

import { LoginPanel, ViewerBoundary } from '@/features/auth';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { BrandAppBar } from '@/shared/ui/@core/top-app-bar';
import { BottomNav } from '@/widgets/bottom-nav';

import { GalleryFeed } from '@/features/post';

export function HomePageTemplate() {
  return (
    <div className="flex flex-1 flex-col">
      <BrandAppBar />
      <div className="flex flex-1 flex-col px-4 py-5 tablet:px-8 desktop:py-8">
        <ViewerBoundary
          guest={
            <div className="mx-auto w-full max-w-app py-6 desktop:py-10">
              <LoginPanel />
            </div>
          }
          fallback={<Skeleton className="h-32 w-full" />}
        >
          {() => <GalleryFeed />}
        </ViewerBoundary>
      </div>
      <BottomNav />
    </div>
  );
}
