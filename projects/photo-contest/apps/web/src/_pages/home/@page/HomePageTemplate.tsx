'use client';

import { LoginPanel, ViewerBoundary } from '@/features/auth';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { BrandAppBar } from '@/shared/ui/@core/top-app-bar';
import { BottomNav } from '@/widgets/bottom-nav';
import { ROUTES } from '@/shared/constants/routes';
import { ButtonLink } from '@/shared/ui/@core/button';

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
              <ButtonLink href={ROUTES.EXPLORE} variant="secondary" fullWidth className="mt-5">
                로그인 없이 그룹 둘러보기
              </ButtonLink>
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
