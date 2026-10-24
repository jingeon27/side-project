'use client';

import { type QueryRef } from '@apollo/client/react';
import { Compass } from 'lucide-react';

import { DiscoverGroupCard } from '@/features/group';
import type { DiscoverGroupsQuery } from '@/shared/api/generated';
import { useInfiniteQuery } from '@/shared/api/infinite-query.hook';
import { Button } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';

export function GroupDiscoveryResults({ queryRef }: { queryRef: QueryRef<DiscoverGroupsQuery> }) {
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery(queryRef, {
    select: (data) => data.discoverGroups,
    pageSize: 24,
  });
  if (!data.discoverGroups.length)
    return (
      <EmptyState
        icon={<Compass className="size-6" />}
        title="아직 찾는 그룹이 없어요"
        description="다른 이름으로 검색하거나 직접 그룹을 만들어 보세요."
      />
    );
  return (
    <div className="flex flex-col gap-6">
      <div className="grid min-w-0 grid-cols-1 gap-4 tablet:grid-cols-2 wide:grid-cols-3">
        {data.discoverGroups.map(({ id }) => (
          <DiscoverGroupCard key={id} id={id} />
        ))}
      </div>
      {hasNextPage ? (
        <Button variant="secondary" loading={isFetchingNextPage} onClick={() => fetchNextPage()}>
          그룹 더 보기
        </Button>
      ) : null}
    </div>
  );
}
