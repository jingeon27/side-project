'use client';

import { useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';
import { ArrowUpRight, UsersRound } from 'lucide-react';

import { DiscoverGroupCard, GroupSearchForm } from '@/features/group';
import { DiscoverGroupsDocument, GroupVisibility, type DiscoverGroupsQuery } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { ButtonLink } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';

import { PublicGalleryBoard } from './PublicGalleryBoard';

function PublicGroups({ queryRef }: { queryRef: QueryRef<DiscoverGroupsQuery> }) {
  const { data } = useReadQuery(queryRef);
  if (!data.discoverGroups.length)
    return (
      <EmptyState
        icon={<UsersRound />}
        title="아직 공개 그룹이 없어요"
        description="전체 그룹에서 함께할 곳을 찾거나 직접 그룹을 만들어 보세요."
        action={
          <ButtonLink href={ROUTES.EXPLORE} variant="secondary" size="lg">
            전체 그룹 둘러보기 <ArrowUpRight aria-hidden className="size-4" />
          </ButtonLink>
        }
      />
    );
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 tablet:grid-cols-2 wide:grid-cols-3">
      {data.discoverGroups.map(({ id }) => (
        <DiscoverGroupCard key={id} id={id} joinable />
      ))}
    </div>
  );
}
export function NoGroupHome() {
  const [queryRef, { refetch }] = useBackgroundQuery(DiscoverGroupsDocument, {
    variables: { visibility: GroupVisibility.Public, offset: 0, limit: 6 },
  });
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <div className="flex flex-col gap-4">
        <p className="text-body text-muted">함께할 그룹을 찾아보세요. 참여하면 새 게시물이 홈에 모여요.</p>
        <GroupSearchForm />
      </div>
      <section aria-label="공개 그룹 목록" className="flex min-w-0 flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-title-lg text-ink">공개 그룹</h2>
          <ButtonLink href={ROUTES.EXPLORE} variant="ghost" size="md">
            그룹 찾아보기
          </ButtonLink>
        </div>
        <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-48 w-full" />}>
          <PublicGroups queryRef={queryRef} />
        </AsyncBoundary>
      </section>
      <PublicGalleryBoard />
    </div>
  );
}
