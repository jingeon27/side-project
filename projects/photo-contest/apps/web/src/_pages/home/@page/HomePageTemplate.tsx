'use client';

import { ArrowUpRight } from 'lucide-react';

import { ViewerBoundary } from '@/features/auth';
import { ROUTES } from '@/shared/constants/routes';
import { ButtonLink } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { HomeAppBar } from '@/shared/ui/@core/top-app-bar';
import { BottomNav } from '@/widgets/bottom-nav';
import { NotificationBell } from '@/widgets/notification-bell';

import { MemberHome } from './ui/MemberHome';

export function HomePageTemplate({ initialHasGroups }: { initialHasGroups?: boolean }) {
  return (
    <div className="flex flex-1 flex-col">
      <HomeAppBar actions={<NotificationBell />} />
      <div className="flex flex-1 flex-col px-4 py-5 tablet:px-8 desktop:py-8">
        <header className="mx-auto mb-6 flex w-full max-w-6xl flex-wrap items-end justify-between gap-4 desktop:mb-8">
          <div>
            <h2 className="text-title-lg text-ink tablet:text-display">우리끼리 모은 순간.</h2>
            <p className="mt-2 hidden text-body text-muted desktop:block">
              가입한 그룹의 새로운 이야기와 웃긴 순간을 모아봐요.
            </p>
          </div>
          <ButtonLink
            href={ROUTES.EXPLORE}
            variant="secondary"
            size="md"
            className="hidden desktop:inline-flex"
          >
            그룹 둘러보기 <ArrowUpRight aria-hidden className="size-4" />
          </ButtonLink>
        </header>
        <ViewerBoundary
          guest={<Skeleton className="h-32 w-full" />}
          fallback={<Skeleton className="h-32 w-full" />}
        >
          {() => <MemberHome initialHasGroups={initialHasGroups} />}
        </ViewerBoundary>
      </div>
      <BottomNav />
    </div>
  );
}
