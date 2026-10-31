'use client';

import { useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';

import { GroupCard } from '@/features/group';
import { GalleryFeed, LatestPosts, PopularPosts, PostsEmptyState } from '@/features/post';
import { MyGroupsDocument, type MyGroupsQuery } from '@/shared/api/generated';
import { useIsSSR } from '@/shared/model/is-ssr.hook';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Skeleton } from '@/shared/ui/@core/skeleton';

import { NoGroupHome } from '../no-group/NoGroupHome';

function MemberHomeContent({
  queryRef,
  initialHasGroups,
}: {
  queryRef: QueryRef<MyGroupsQuery>;
  initialHasGroups?: boolean;
}) {
  const isSSR = useIsSSR();
  const { data } = useReadQuery(queryRef);
  // 가입·prefetch가 캐시를 먼저 바꿔도 hydration 중에는 라우트가 그린 최초 화면을 유지한다.
  const hasGroups = isSSR && initialHasGroups !== undefined ? initialHasGroups : data.myGroups.length > 0;
  if (!hasGroups) return <NoGroupHome signedIn />;
  // 라우트는 가입 그룹이 있다고 판단했을 때만 최신·인기 피드를 사전 조회한다.
  const preloaded = initialHasGroups === true;
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6">
      <section aria-label="참여한 그룹" className="flex flex-col gap-3">
        <h2 className="text-title text-ink">참여한 그룹</h2>
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 wide:grid-cols-3">
          {data.myGroups.map((group) => (
            <GroupCard key={group.id} group={group} />
          ))}
        </div>
      </section>
      <GalleryFeed
        latest={<LatestPosts title="최신 게시물" preloaded={preloaded} empty={<PostsEmptyState />} />}
        popular={<PopularPosts preloaded={preloaded} />}
      />
    </div>
  );
}
export function MemberHome({ initialHasGroups }: { initialHasGroups?: boolean }) {
  const [queryRef, { refetch }] = useBackgroundQuery(MyGroupsDocument);
  return (
    <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-48 w-full" />}>
      <MemberHomeContent queryRef={queryRef} initialHasGroups={initialHasGroups} />
    </AsyncBoundary>
  );
}
