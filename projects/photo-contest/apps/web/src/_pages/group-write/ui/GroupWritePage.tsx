'use client';

import { useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';

import { GalleryDocument, type GalleryQuery, type GalleryQueryVariables } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { useAppRouter } from '@/shared/model/router';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

import { CreatePostForm } from './CreatePostForm';

function GroupName({
  groupRef,
}: {
  groupRef: QueryRef<GalleryQuery, GalleryQueryVariables, 'empty' | 'complete' | 'streaming'>;
}) {
  const { data } = useReadQuery(groupRef);
  if (!data) return null;
  return <p className="wrap-anywhere text-subtitle text-ink">{data.group.name}</p>;
}

export function GroupWritePage({ groupId, contestId }: { groupId: string; contestId?: string }) {
  const router = useAppRouter();
  const [groupRef, { refetch }] = useBackgroundQuery(GalleryDocument, {
    variables: { id: groupId },
    errorPolicy: 'all',
  });
  const returnPath = contestId ? ROUTES.GROUP_CONTEST(groupId, contestId) : ROUTES.GROUP(groupId);
  return (
    <div data-page-form className="flex min-h-0 min-w-0 flex-col">
      <TopAppBar title="그룹에 글쓰기" backHref={returnPath} />
      {/* 폼과 같이 여백 안쪽에서 최대 폭을 잡아야 그룹 이름과 첫 입력의 시작선이 맞는다. */}
      <div className="px-4 pt-6 tablet:px-8">
        <div className="mx-auto w-full max-w-5xl">
          <AsyncBoundary onRetry={refetch} fallback={<Skeleton className="h-6 w-40" />}>
            <GroupName groupRef={groupRef} />
          </AsyncBoundary>
          <p className="mt-2 text-body text-muted">사진도 동영상도, 직접 찍은 순간도 합성도 환영해요.</p>
        </div>
      </div>
      <CreatePostForm
        groupId={groupId}
        defaultContestId={contestId}
        onCreated={() => router.replace(returnPath)}
      />
    </div>
  );
}
