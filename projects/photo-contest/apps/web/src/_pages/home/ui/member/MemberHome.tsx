'use client';

import Link from 'next/link';

import { useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';

import { PostsEmptyState } from '@/features/post';
import { MyGroupsDocument, type MyGroupsQuery } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { useIsSSR } from '@/shared/model/is-ssr.hook';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Avatar } from '@/shared/ui/@core/avatar';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { ComposeEntryButton } from '@/widgets/compose-entry';
import { GalleryFeed, LatestPosts, PopularPosts } from '@/widgets/post-feed';

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
  if (!hasGroups)
    return (
      <>
        <NoGroupHome />
        <ComposeEntryButton hasGroups={false} />
      </>
    );
  // 라우트는 가입 그룹이 있다고 판단했을 때만 최신·인기 피드를 사전 조회한다.
  const preloaded = initialHasGroups === true;
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6">
      {/* 홈의 주인공은 피드다. 그룹은 한 줄로 바로 가기만 두고, 멤버 수·소개는 MY의 그룹 카드에서 본다. */}
      <section aria-label="참여한 그룹" className="flex flex-col gap-3">
        <h2 className="text-title text-ink">참여한 그룹</h2>
        <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 py-1 tablet:-mx-8 tablet:px-8 desktop:mx-0 desktop:flex-wrap desktop:overflow-visible desktop:p-0">
          {data.myGroups.map((group) => (
            <li key={group.id} className="shrink-0">
              <Link
                href={ROUTES.GROUP(group.id)}
                className="group flex w-20 flex-col items-center gap-1.5 text-center active:opacity-60"
              >
                <Avatar
                  name={group.name}
                  src={group.avatarUrl}
                  size="lg"
                  className="size-16 rounded-[36%] bg-brand-gradient text-title text-on-gradient transition-transform group-hover:scale-105"
                />
                <span className="line-clamp-2 w-full text-caption leading-tight text-ink">{group.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <GalleryFeed
        latest={<LatestPosts title="최신 게시물" preloaded={preloaded} empty={<PostsEmptyState />} />}
        popular={
          <PopularPosts
            preloaded={preloaded}
            empty={<p className="text-body text-muted">이번 달에 올라온 게시물이 아직 없어요.</p>}
          />
        }
      />
      <ComposeEntryButton hasGroups />
    </div>
  );
}
export function MemberHome({ initialHasGroups }: { initialHasGroups?: boolean }) {
  const [queryRef, { refetch }] = useBackgroundQuery(MyGroupsDocument);
  return (
    <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-24 w-full" />}>
      <MemberHomeContent queryRef={queryRef} initialHasGroups={initialHasGroups} />
    </AsyncBoundary>
  );
}
