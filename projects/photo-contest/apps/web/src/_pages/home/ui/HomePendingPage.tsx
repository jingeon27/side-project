import { Skeleton } from '@/shared/ui/@core/skeleton';
import { HomeAppBar } from '@/shared/ui/@core/top-app-bar';
import { BottomNav } from '@/widgets/bottom-nav';

export function HomePendingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <HomeAppBar />
      <div role="status" aria-label="피드 불러오는 중" className="flex flex-1 flex-col gap-4 p-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
      <BottomNav />
    </div>
  );
}
