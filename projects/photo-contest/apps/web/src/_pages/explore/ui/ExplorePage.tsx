'use client';

import { useBackgroundQuery } from '@apollo/client/react';

import { ViewerBoundary } from '@/features/auth';
import { GroupSearchForm } from '@/features/group';
import { DiscoverGroupsDocument } from '@/shared/api/generated';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';
import { BottomNav } from '@/widgets/bottom-nav';

import { ExploreComposeEntry } from './ExploreComposeEntry';
import { GroupDiscoveryResults } from './GroupDiscoveryResults';

export function ExplorePage({ search }: { search: string }) {
  const [queryRef, { refetch }] = useBackgroundQuery(DiscoverGroupsDocument, {
    variables: { search, offset: 0, limit: 24 },
    refetchWritePolicy: 'overwrite',
  });
  return (
    <div className="flex flex-1 flex-col">
      <TopAppBar title="그룹 탐색" />
      <div className="mx-auto flex w-full max-w-5xl desktop:max-w-none flex-1 flex-col gap-7 px-4 pt-6 pb-24 tablet:px-8 desktop:pt-10 desktop:pb-28">
        <GroupSearchForm key={search} search={search} />
        <section aria-label="탐색할 그룹" className="flex flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-2" aria-live="polite" aria-atomic>
            <h2 className="text-title-lg text-ink">{search ? '검색 결과' : '새로 만들어진 그룹'}</h2>
            {search ? <p className="line-clamp-2 wrap-anywhere text-body text-muted">“{search}”</p> : null}
          </div>
          <AsyncBoundary resetKey={search} onRetry={refetch} fallback={<Skeleton className="h-60 w-full" />}>
            <GroupDiscoveryResults key={search} queryRef={queryRef} search={search} />
          </AsyncBoundary>
        </section>
      </div>
      <ViewerBoundary guest={null} fallback={null}>
        {() => <ExploreComposeEntry />}
      </ViewerBoundary>
      <BottomNav />
    </div>
  );
}
