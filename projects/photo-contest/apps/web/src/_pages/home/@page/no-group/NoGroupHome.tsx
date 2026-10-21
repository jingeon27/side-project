'use client';

import { useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';

import { CreateGroupButton, DiscoverGroupCard, GroupSearchForm } from '@/features/group';
import { PublicGalleryBoard } from '@/features/post';
import { DiscoverGroupsDocument, GroupVisibility, type DiscoverGroupsQuery } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { ButtonLink } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';

function PublicGroups({ queryRef }: { queryRef: QueryRef<DiscoverGroupsQuery> }) {
  const { data } = useReadQuery(queryRef);
  if (!data.discoverGroups.length)
    return <p className="py-6 text-body text-muted">첫 공개 그룹을 만들어 웃긴 순간을 나눠보세요.</p>;
  return (
    <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
      {data.discoverGroups.map(({ id }) => (
        <DiscoverGroupCard key={id} id={id} joinable />
      ))}
    </div>
  );
}
export function NoGroupHome({ signedIn = false }: { signedIn?: boolean }) {
  const [queryRef, { refetch }] = useBackgroundQuery(DiscoverGroupsDocument, {
    variables: { visibility: GroupVisibility.Public, offset: 0, limit: 6 },
  });
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <GroupSearchForm />
      <section aria-label="추천 공개 그룹" className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-subtitle text-ink">공개 그룹</h2>
          <ButtonLink href={ROUTES.EXPLORE} variant="ghost" size="md">
            더보기
          </ButtonLink>
        </div>
        <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-48 w-full" />}>
          <PublicGroups queryRef={queryRef} />
        </AsyncBoundary>
        {signedIn ? (
          <div>
            <CreateGroupButton />
          </div>
        ) : null}
      </section>
      <PublicGalleryBoard />
    </div>
  );
}
