'use client';

import { useTransition } from 'react';

import { type QueryRef } from '@apollo/client/react';
import { ArrowUpRight, Compass } from 'lucide-react';

import { DiscoverGroupCard } from '@/features/group';
import type { DiscoverGroupsQuery } from '@/shared/api/generated';
import { useInfiniteQuery } from '@/shared/api/infinite-query.hook';
import { ROUTES } from '@/shared/constants/routes';
import { useAppRouter } from '@/shared/model/router';
import { Button, ButtonLink } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';

export function GroupDiscoveryResults({
  queryRef,
  search,
}: {
  queryRef: QueryRef<DiscoverGroupsQuery>;
  search: string;
}) {
  const router = useAppRouter();
  const [pending, startTransition] = useTransition();
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery(queryRef, {
    select: (data) => data.discoverGroups,
    pageSize: 24,
  });
  if (!data.discoverGroups.length)
    return (
      <EmptyState
        icon={<Compass className="size-6" />}
        title={search ? '검색한 그룹을 찾지 못했어요' : '아직 만들어진 그룹이 없어요'}
        description={
          search
            ? '검색어를 바꾸거나 전체 그룹을 둘러보세요.'
            : '첫 그룹을 만들고 함께 나눌 사람들을 초대해 보세요.'
        }
        action={
          search ? (
            <Button
              variant="secondary"
              size="lg"
              loading={pending}
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.delete('q');
                startTransition(() => router.replace(`${url.pathname}${url.search}${url.hash}`));
              }}
            >
              전체 그룹 보기 <ArrowUpRight aria-hidden className="size-4" />
            </Button>
          ) : (
            <ButtonLink href={ROUTES.GROUP_CREATE} variant="secondary" size="lg">
              첫 그룹 만들기 <ArrowUpRight aria-hidden className="size-4" />
            </ButtonLink>
          )
        }
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
        <Button variant="secondary" loading={isFetchingNextPage} onClick={fetchNextPage}>
          그룹 더 보기
        </Button>
      ) : null}
    </div>
  );
}
