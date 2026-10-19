'use client';

import { useBackgroundQuery, useReadQuery } from '@apollo/client/react';
import type { QueryRef } from '@apollo/client/react';
import { Users } from 'lucide-react';
import { match } from 'ts-pattern';

import { CreateGroupButton, GroupCard } from '@/features/group';
import { MyGroupsDocument } from '@/shared/api/generated';
import type { MyGroupsQuery } from '@/shared/api/generated';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';

function MyGroupsContent({ groupsRef }: { groupsRef: QueryRef<MyGroupsQuery> }) {
  const { data } = useReadQuery(groupsRef);
  return match(data.myGroups)
    .with([], () => (
      <EmptyState
        icon={<Users className="size-6" />}
        title="아직 참여한 그룹이 없어요"
        description="탐색에서 그룹을 찾거나 직접 그룹을 만들어 보세요."
      />
    ))
    .otherwise((groups) => (
      <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-1 wide:grid-cols-2">
        {groups.map((group) => (
          <GroupCard key={group.id} group={group} />
        ))}
      </div>
    ));
}

export function MyGroupsSection() {
  const [groupsRef, { refetch }] = useBackgroundQuery(MyGroupsDocument);
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-title text-ink">내 그룹</h2>
        <CreateGroupButton />
      </div>
      <AsyncBoundary fallback={<Skeleton className="h-32 w-full" />} onRetry={refetch}>
        <MyGroupsContent groupsRef={groupsRef} />
      </AsyncBoundary>
    </section>
  );
}
