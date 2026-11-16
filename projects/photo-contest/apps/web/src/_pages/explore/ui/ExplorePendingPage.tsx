import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';
import { BottomNav } from '@/widgets/bottom-nav';

export function ExplorePendingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <TopAppBar title="그룹 탐색" />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-7 px-4 pt-6 tablet:px-8">
        <div aria-hidden className="flex items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-12 w-full" />
          </div>
          <Skeleton className="h-12 w-24 shrink-0 rounded-full" />
        </div>
        <div role="status" aria-label="그룹 목록 불러오는 중">
          <Skeleton className="h-60 w-full" />
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
