'use client';

import { useBackgroundQuery, useQueryRefHandlers, useReadQuery } from '@apollo/client/react';
import type { QueryRef } from '@apollo/client/react';
import Link from 'next/link';
import { ArrowUpRight, Images, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { match } from 'ts-pattern';

import { PhaseBadge } from '@/features/contest';
import { LikeButton } from '@/features/like';
import { FEED_PAGE_SIZE, FeedLoadMore, SubmissionCard } from '@/features/submission';
import { MyPhotoFeedDocument } from '@/shared/api/generated';
import type { MyPhotoFeedQuery } from '@/shared/api/generated';
import { ROUTES } from '@/shared/constants/routes';
import { formatDateTime } from '@/shared/lib/format.helper';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button, ButtonLink } from '@/shared/ui/@core/button';
import { EmptyState } from '@/shared/ui/@core/empty-state';
import { Skeleton } from '@/shared/ui/@core/skeleton';

function FeedContent({ feedRef, viewerId }: { feedRef: QueryRef<MyPhotoFeedQuery>; viewerId: string }) {
  const { data } = useReadQuery(feedRef);
  const { fetchMore, refetch } = useQueryRefHandlers(feedRef);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [pending, startTransition] = useTransition();
  const photos = data.myPhotoFeed.filter(({ submission }) => !submission.hidden);
  const firstId = data.myPhotoFeed[0]?.id;
  const previousFirstId = useRef(firstId);
  useEffect(() => {
    if (previousFirstId.current !== firstId) {
      previousFirstId.current = firstId;
      setHasNextPage(true);
    }
  }, [firstId]);
  const handleLoadMore = () => {
    if (pending || !hasNextPage) return;
    startTransition(async () => {
      try {
        const next = await fetchMore({ variables: { offset: data.myPhotoFeed.length } });
        setHasNextPage(next.data.myPhotoFeed.length === FEED_PAGE_SIZE);
      } catch {
        /* 조회 경계에서 재시도한다. */
      }
    });
  };
  const handleRefresh = () =>
    startTransition(async () => {
      try {
        await refetch();
        setHasNextPage(true);
      } catch {
        /* 기존 사진은 유지하고 오류 경계에서 복구한다. */
      }
    });
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-muted">가입한 모든 그룹의 사진 · 최신순</p>
        <Button variant="ghost" size="sm" loading={pending} onClick={handleRefresh}>
          <RefreshCw aria-hidden className="size-4" /> 새로고침
        </Button>
      </div>
      {match(photos)
        .with([], () => (
          <div className="rounded-card border border-dashed border-line-strong p-6 text-center">
            <EmptyState
              icon={<Images className="size-6" />}
              title="아직 올라온 사진이 없어요"
              description="그룹에서 사진을 올리면 이곳에 모여요. 첫 웃긴 순간을 남겨보세요."
            />
            <ButtonLink href={ROUTES.ME} variant="secondary">
              내 그룹 보기
            </ButtonLink>
          </div>
        ))
        .otherwise((items) => (
          <div className="grid items-start gap-5 tablet:grid-cols-2 desktop:grid-cols-3" data-photo-feed>
            {items.map(({ id, groupId, groupName, contestTitle, phase, submission }, index) => (
              <SubmissionCard
                key={id}
                submission={submission}
                viewerId={viewerId}
                isPriority={index === 0}
                header={
                  <div className="flex flex-col gap-2 border-b border-line p-4">
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        href={ROUTES.GROUP(groupId)}
                        className="truncate text-label text-brand hover:underline"
                      >
                        {groupName}
                      </Link>
                      <PhaseBadge phase={phase} />
                    </div>
                    <Link
                      href={ROUTES.CONTEST(submission.contestId)}
                      className="flex items-center gap-1 text-caption text-muted hover:text-ink"
                    >
                      <span className="truncate">{contestTitle}</span>
                      <ArrowUpRight aria-hidden className="size-4 shrink-0" />
                    </Link>
                  </div>
                }
                stats={
                  <time dateTime={submission.createdAt} className="text-caption text-muted">
                    {formatDateTime(submission.createdAt)}
                  </time>
                }
                actions={
                  <>
                    <LikeButton submission={submission} isMine={submission.author.id === viewerId} />
                    <ButtonLink
                      href={ROUTES.CONTEST(submission.contestId)}
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                    >
                      대회 보기
                    </ButtonLink>
                  </>
                }
              />
            ))}
          </div>
        ))}
      <FeedLoadMore
        hasMore={hasNextPage && data.myPhotoFeed.length >= FEED_PAGE_SIZE}
        loading={pending}
        onLoadMore={handleLoadMore}
      />
    </div>
  );
}

export function HomePhotoFeed({ viewerId }: { viewerId: string }) {
  const [feedRef, { refetch }] = useBackgroundQuery(MyPhotoFeedDocument, {
    variables: { offset: 0, limit: FEED_PAGE_SIZE },
    refetchWritePolicy: 'overwrite',
  });
  return (
    <section className="flex flex-col gap-4" aria-labelledby="home-feed-title">
      <h2 id="home-feed-title" className="text-title-lg text-ink">
        최신 사진
      </h2>
      <AsyncBoundary
        onRetry={refetch}
        fallback={
          <div className="grid gap-5 tablet:grid-cols-2 desktop:grid-cols-3">
            {[0, 1, 2].map((id) => (
              <Skeleton key={id} className="aspect-square w-full" />
            ))}
          </div>
        }
      >
        <FeedContent feedRef={feedRef} viewerId={viewerId} />
      </AsyncBoundary>
    </section>
  );
}
