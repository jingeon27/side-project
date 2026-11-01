'use client';

import { useSearchParams } from 'next/navigation';

import { GroupSearchForm } from '@/features/group';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';
import { BottomNav } from '@/widgets/bottom-nav';

import { exploreSearchSchema } from '../model/explore-search.schema';

export function ExplorePendingPage() {
  const search = useSearchParams();
  const { q } = exploreSearchSchema.parse({ q: search.get('q') });
  return (
    <div className="flex flex-1 flex-col">
      <TopAppBar title="그룹 탐색" />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-7 px-4 pt-6 tablet:px-8">
        <GroupSearchForm key={q} search={q} />
        <div role="status" aria-label="그룹 목록 불러오는 중">
          <Skeleton className="h-60 w-full" />
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
