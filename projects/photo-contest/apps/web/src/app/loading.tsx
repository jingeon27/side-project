import { Skeleton } from '@/shared/ui/@core/skeleton';
import { Spinner } from '@/shared/ui/@core/spinner';

export default function Loading() {
  return (
    <div role="status" aria-label="불러오는 중" className="flex flex-1 flex-col">
      <div className="flex h-app-bar items-center border-b border-line px-4">
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="flex flex-col gap-3 p-4">
        <Spinner className="mx-auto my-4 size-8 text-accent" />
        <Skeleton className="h-28 w-full rounded-card" />
        <Skeleton className="h-20 w-full rounded-card" />
        <Skeleton className="h-20 w-full rounded-card" />
      </div>
    </div>
  );
}
