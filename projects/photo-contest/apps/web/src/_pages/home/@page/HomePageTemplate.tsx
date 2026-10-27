'use client';

import { ViewerBoundary } from '@/features/auth';
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
