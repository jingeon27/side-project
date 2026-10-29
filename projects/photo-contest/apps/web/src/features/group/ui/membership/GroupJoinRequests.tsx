'use client';

import { useTransition } from 'react';

import { skipToken, useBackgroundQuery, useFragment, useMutation, type QueryRef } from '@apollo/client/react';

import {
  ApproveGroupJoinRequestDocument,
  DiscoverGroupsDocument,
  GalleryDocument,
  GroupJoinRequestRowFragmentDoc,
  GroupJoinRequestsDocument,
  MyGroupsDocument,
  MyNotificationsDocument,
  NotificationUnreadCountDocument,
  RejectGroupJoinRequestDocument,
  type GroupJoinRequestsQuery,
} from '@/shared/api/generated';
import { useInfiniteQuery } from '@/shared/api/infinite-query.hook';
import { formatDateTime } from '@/shared/lib/format.helper';
import { useIsSSR } from '@/shared/model/is-ssr.hook';
import { toast } from '@/shared/model/toast';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Avatar } from '@/shared/ui/@core/avatar';
import { Button } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';

const PAGE_SIZE = 24;
const refetchQueries = [
  GroupJoinRequestsDocument,
  GalleryDocument,
  MyGroupsDocument,
  DiscoverGroupsDocument,
  MyNotificationsDocument,
  NotificationUnreadCountDocument,
];

function JoinRequestRow({ id }: { id: string }) {
  const { data: request, complete } = useFragment({
    fragment: GroupJoinRequestRowFragmentDoc,
    from: { __typename: 'GroupJoinRequest', id },
  });
  const [approve, approving] = useMutation(ApproveGroupJoinRequestDocument, {
    refetchQueries,
    awaitRefetchQueries: true,
    onCompleted: () => toast.success('가입 신청을 수락했어요'),
  });
  const [reject, rejecting] = useMutation(RejectGroupJoinRequestDocument, {
    refetchQueries,
    awaitRefetchQueries: true,
    onCompleted: () => toast.success('가입 신청을 거절했어요'),
  });
  if (!complete) return null;
  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-line py-4 last:border-0">
      <Avatar name={request.user.nickname} src={request.user.avatar} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="wrap-break-word text-label text-ink">{request.user.nickname}</p>
        <p className="text-caption text-muted">{formatDateTime(request.createdAt)}</p>
      </div>
      <div className="flex gap-2">
        <Button
          size="md"
          variant="secondary"
          aria-label={`${request.user.nickname} 가입 거절`}
          loading={rejecting.loading}
          disabled={approving.loading}
          onClick={async () => {
            try {
              await reject({ variables: { requestId: id } });
            } catch {
              /* ErrorLink가 알린다. */
            }
          }}
        >
          거절
        </Button>
        <Button
          size="md"
          aria-label={`${request.user.nickname} 가입 수락`}
          loading={approving.loading}
          disabled={rejecting.loading}
          onClick={async () => {
            try {
              await approve({ variables: { requestId: id } });
            } catch {
              /* ErrorLink가 알린다. */
            }
          }}
        >
          수락
        </Button>
      </div>
    </li>
  );
}

function RequestList({ queryRef }: { queryRef: QueryRef<GroupJoinRequestsQuery> }) {
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery(queryRef, {
    select: (data) => data.groupJoinRequests,
    pageSize: PAGE_SIZE,
  });
  return (
    <>
      {data.groupJoinRequests.length ? (
        <ul aria-label="그룹 가입 신청">
          {data.groupJoinRequests.map(({ id }) => (
            <JoinRequestRow key={id} id={id} />
          ))}
        </ul>
      ) : (
        <p className="py-5 text-body text-muted">대기 중인 가입 신청이 없어요.</p>
      )}
      {hasNextPage ? (
        <Button variant="secondary" size="md" loading={isFetchingNextPage} onClick={fetchNextPage}>
          가입 신청 더 보기
        </Button>
      ) : null}
    </>
  );
}

/** 신청 목록은 사전 조회하지 않으므로 브라우저에서 시작하고, 제목·설명은 서버 HTML에 둔다. */
export function GroupJoinRequests({ groupId }: { groupId: string }) {
  const [queryRef, { refetch }] = useBackgroundQuery(
    GroupJoinRequestsDocument,
    useIsSSR()
      ? skipToken
      : {
          variables: { groupId, offset: 0, limit: PAGE_SIZE },
          refetchWritePolicy: 'overwrite',
          fetchPolicy: 'network-only',
        },
  );
  // 새로고침은 transition으로 보내 받는 동안 기존 목록을 그대로 둔다(밖에서 부르면 목록이 다시 Suspense된다).
  const [refreshing, startTransition] = useTransition();
  const fallback = <Skeleton className="mt-4 h-24 w-full" />;
  return (
    <section
      id="join-requests"
      className="scroll-mt-20 rounded-card border border-line bg-surface p-4"
      aria-label="가입 신청 관리"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title text-ink">가입 신청 관리</h2>
        <Button
          size="md"
          variant="ghost"
          disabled={!queryRef}
          loading={refreshing}
          onClick={() =>
            startTransition(async () => {
              try {
                await refetch();
              } catch {
                /* 조회 경계에서 재시도한다. */
              }
            })
          }
        >
          신청 새로고침
        </Button>
      </div>
      <p className="mt-1 text-caption text-muted">수락한 멤버만 이 그룹의 게시물을 볼 수 있어요.</p>
      <AsyncBoundary fallback={fallback} onRetry={refetch}>
        {queryRef ? <RequestList queryRef={queryRef} /> : fallback}
      </AsyncBoundary>
    </section>
  );
}
