'use client';

import { useBackgroundQuery } from '@apollo/client/react';

import { ViewerBoundary } from '@/features/auth';
import { CreateGroupButton, GroupSearchForm } from '@/features/group';
import { DiscoverGroupsDocument } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { buildLoginRedirectPath } from '@/shared/lib/auth-gate.helper';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { ButtonLink } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';
import { BottomNav } from '@/widgets/bottom-nav';

import { GroupDiscoveryResults } from './ui/GroupDiscoveryResults';

export function ExplorePageTemplate({ search }: { search: string }) {
  const [queryRef, { refetch }] = useBackgroundQuery(DiscoverGroupsDocument, {
    variables: { search, offset: 0, limit: 24 },
    refetchWritePolicy: 'overwrite',
  });
  return (
    <div className="flex flex-1 flex-col">
      <TopAppBar title="그룹 탐색" />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-7 px-4 py-6 tablet:px-8 desktop:py-10">
        <section className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-caption text-muted">취향이 맞는 사람들과</p>
            <h2 className="mt-1 text-title-lg text-ink">웃긴 순간을 함께 나눠요.</h2>
            <p className="mt-2 text-body text-muted">
              공개 그룹은 누구나 구경하고, 비공개 그룹은 가입을 신청해요.
            </p>
          </div>
          <ViewerBoundary
            guest={
              <ButtonLink href={buildLoginRedirectPath(ROUTES.EXPLORE)} size="md">
                로그인하고 그룹 만들기
              </ButtonLink>
            }
            fallback={<Skeleton className="h-11 w-28" />}
          >
            {() => <CreateGroupButton />}
          </ViewerBoundary>
        </section>
        <GroupSearchForm key={search} search={search} />
        <section aria-label="탐색할 그룹" className="flex flex-col gap-4">
          <h2 className="text-title text-ink">{search ? `“${search}” 검색 결과` : '새로 만들어진 그룹'}</h2>
          <AsyncBoundary resetKey={search} onRetry={refetch} fallback={<Skeleton className="h-60 w-full" />}>
            <GroupDiscoveryResults key={search} queryRef={queryRef} />
          </AsyncBoundary>
        </section>
      </div>
      <BottomNav />
    </div>
  );
}
