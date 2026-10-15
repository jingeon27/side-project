'use client';

import { useBackgroundQuery, useReadQuery } from '@apollo/client/react';
import type { QueryRef } from '@apollo/client/react';
import { Plus, Users } from 'lucide-react';
import { overlay } from 'overlay-kit';
import { match } from 'ts-pattern';

import { PhaseBadge } from '@/features/contest';
import { CreateGroupBottomSheet, GroupCard } from '@/features/group';
import { MyGroupsDocument } from '@/shared/api/generated';
import type { MyGroupsQuery } from '@/shared/api/generated';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';

function handleCreateGroup() {
  overlay.open(({ isOpen, close, unmount }) => (
    <CreateGroupBottomSheet isOpen={isOpen} onClose={close} unmount={unmount} />
  ));
}

function MyGroupsContent({ groupsRef }: { groupsRef: QueryRef<MyGroupsQuery> }) {
  const { data } = useReadQuery(groupsRef);
  return match(data.myGroups)
    .with([], () => (
      <EmptyState
        icon={<Users className="size-6" />}
        title="아직 참여한 그룹이 없어요"
        description="그룹을 만들거나 친구의 초대 링크로 참여해 보세요."
      />
    ))
    .otherwise((groups) => (
      <div className="grid gap-3 tablet:grid-cols-2">
        {groups.map((group) => {
          const latest = group.contests[0];
          return (
            <GroupCard
              key={group.id}
              group={group}
              latestContest={
                latest ? (
                  <span className="flex items-center gap-2 text-caption text-muted">
                    <PhaseBadge phase={latest.phase} />
                    {latest.title}
                  </span>
                ) : undefined
              }
            />
          );
        })}
      </div>
    ));
}

export function MyGroupsSection() {
  const [groupsRef, { refetch }] = useBackgroundQuery(MyGroupsDocument);
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-title text-ink">내 그룹</h2>
        <Button size="md" onClick={handleCreateGroup}>
          <Plus aria-hidden className="size-4" />
          그룹 만들기
        </Button>
      </div>
      <AsyncBoundary fallback={<Skeleton className="h-32 w-full" />} onRetry={refetch}>
        <MyGroupsContent groupsRef={groupsRef} />
      </AsyncBoundary>
    </section>
  );
}
