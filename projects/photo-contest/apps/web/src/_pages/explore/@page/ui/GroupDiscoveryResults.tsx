'use client';

import { useQueryRefHandlers, useReadQuery, type QueryRef } from '@apollo/client/react';
import { Compass } from 'lucide-react';
import { useState, useTransition } from 'react';

import type { DiscoverGroupsQuery } from '@/shared/api/generated';
import { Button } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';

import { DiscoverGroupCard } from '@/features/group';

export function GroupDiscoveryResults({ queryRef }: { queryRef: QueryRef<DiscoverGroupsQuery> }) {
  const { data } = useReadQuery(queryRef);
  const { fetchMore } = useQueryRefHandlers(queryRef);
  const [hasMore, setHasMore] = useState(true);
  const [pending, startTransition] = useTransition();
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
      {hasMore && data.discoverGroups.length >= 24 ? (
        <Button
          variant="secondary"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                const result = await fetchMore({ variables: { offset: data.discoverGroups.length } });
                setHasMore(result.data.discoverGroups.length === 24);
              } catch {
                /* 조회 경계에서 재시도한다. */
              }
            })
          }
        >
          그룹 더 보기
        </Button>
      ) : null}
    </div>
  );
}
