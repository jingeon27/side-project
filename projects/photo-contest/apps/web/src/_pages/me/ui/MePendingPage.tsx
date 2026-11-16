import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';
import { BottomNav } from '@/widgets/bottom-nav';

export function MePendingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <TopAppBar title="마이페이지" />
      <div role="status" aria-label="내 정보 불러오는 중" className="flex flex-1 flex-col gap-6 p-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
      <BottomNav />
    </div>
  );
}
