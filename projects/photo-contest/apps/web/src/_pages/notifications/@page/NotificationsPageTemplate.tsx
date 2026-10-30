'use client';

import { useBackgroundQuery, useMutation, type QueryRef } from '@apollo/client/react';
import { Heart } from 'lucide-react';
import { overlay } from 'overlay-kit';

import { LoginPanel, ViewerBoundary } from '@/features/auth';
import {
  markAllNotificationsReadInCache,
  markNotificationReadInCache,
  NotificationItem,
} from '@/features/notification';
import { PostCommentsBottomSheet } from '@/features/post';
import {
  MarkAllNotificationsReadDocument,
  MarkNotificationReadDocument,
  MyNotificationsDocument,
  NotificationContestFormat,
  type MyNotificationsQuery,
  type NotificationCardFragment,
} from '@/shared/api/generated';
import { useInfiniteQuery } from '@/shared/api/infinite-query.hook';
import { ROUTES } from '@/shared/constants/routes';
import { useAppRouter } from '@/shared/model/router';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';
import { Button } from '@/shared/ui/@core/button';
import { Skeleton } from '@/shared/ui/@core/skeleton';
import { TopAppBar } from '@/shared/ui/@core/top-app-bar';

import { PushNotificationSettings } from './ui/PushNotificationSettings';

const PAGE_SIZE = 20;

function NotificationList({ queryRef }: { queryRef: QueryRef<MyNotificationsQuery> }) {
  const router = useAppRouter();
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery(queryRef, {
    select: (page) => page.myNotifications.items,
    pageSize: PAGE_SIZE,
    canFetchMore: (page) => page.myNotifications.hasMore,
  });
  // 목록을 다시 받으면 첫 페이지 응답이 더 읽은 알림을 지우므로 읽음은 캐시에서 바로 고친다.
  // 서버가 거절하면 Apollo가 낙관적 변경을 되돌리고 ErrorLink가 알린다.
  const [read] = useMutation(MarkNotificationReadDocument, {
    optimisticResponse: { markNotificationRead: true },
  });
  const [readAll, { loading }] = useMutation(MarkAllNotificationsReadDocument, {
    optimisticResponse: { markAllNotificationsRead: true },
    update: (cache, { data }) => {
      if (data?.markAllNotificationsRead) markAllNotificationsReadInCache(cache, new Date().toISOString());
    },
  });
  const handleOpen = (notice: NotificationCardFragment) => {
    if (!notice.readAt) {
      const readAt = new Date().toISOString();
      // 읽음 저장을 기다리지 않고 바로 연다. 실패해도 알림 내용 열기는 막지 않는다.
      void read({
        variables: { id: notice.id },
        update: (cache, { data }) => {
          if (data?.markNotificationRead) markNotificationReadInCache(cache, notice.id, readAt);
        },
      }).catch(() => undefined);
    }
    const postId = notice.postId;
    if (postId) {
      overlay.open(({ isOpen, close: onClose, unmount }) => (
        <PostCommentsBottomSheet postId={postId} isOpen={isOpen} onClose={onClose} unmount={unmount} />
      ));
      return;
    }
    if (notice.contestId) {
      router.push(
        notice.contestFormat === NotificationContestFormat.Post
          ? ROUTES.GROUP_CONTEST(notice.groupId, notice.contestId)
          : ROUTES.CONTEST(notice.contestId),
      );
      return;
    }
    if (notice.joinRequestId) {
      router.push(`${ROUTES.GROUP(notice.groupId)}#join-requests`);
      return;
    }
    router.push(ROUTES.GROUP(notice.groupId));
  };
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-muted">읽지 않은 알림 {data.myNotifications.unreadCount}개</p>
        <Button
          variant="ghost"
          size="sm"
          loading={loading}
          disabled={!data.myNotifications.unreadCount}
          onClick={async () => {
            try {
              await readAll();
            } catch {
              /* 전역 오류 토스트로 안내한다. */
            }
          }}
        >
          모두 읽음
        </Button>
      </div>
      {data.myNotifications.items.length ? (
        <ul aria-label="활동 알림" className="flex flex-col gap-3">
          {data.myNotifications.items.map(({ id }) => (
            <li key={id}>
              <NotificationItem id={id} onOpen={handleOpen} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Heart aria-hidden className="size-8 text-subtle" />
          <h2 className="text-subtitle text-ink">아직 새 알림이 없어요</h2>
          <p className="text-body text-muted">댓글과 답글, 대회 소식과 그룹 가입 신청을 알려드릴게요.</p>
        </div>
      )}
      {hasNextPage ? (
        <Button variant="secondary" loading={isFetchingNextPage} onClick={fetchNextPage}>
          알림 더 보기
        </Button>
      ) : null}
    </>
  );
}

function NotificationFeed({ viewerId }: { viewerId: string }) {
  const [queryRef, { refetch }] = useBackgroundQuery(MyNotificationsDocument, {
    variables: { offset: 0, limit: PAGE_SIZE },
    refetchWritePolicy: 'overwrite',
  });
  // 앱 알림 설정은 목록 조회와 상관없으므로 목록 경계 밖에 두어 불러오는 중·실패에도 남긴다.
  return (
    <div className="mx-auto flex w-full max-w-feed flex-col gap-4">
      <PushNotificationSettings />
      <AsyncBoundary resetKey={viewerId} onRetry={refetch} fallback={<Skeleton className="h-48 w-full" />}>
        <NotificationList queryRef={queryRef} />
      </AsyncBoundary>
    </div>
  );
}

export function NotificationsPageTemplate() {
  return (
    <div className="flex flex-1 flex-col">
      <TopAppBar title="알림" backHref={ROUTES.HOME} />
      <div className="flex flex-1 flex-col px-4 py-6 tablet:px-8">
        <ViewerBoundary
          guest={<LoginPanel nextPath={ROUTES.NOTIFICATIONS} />}
          fallback={<Skeleton className="h-48 w-full" />}
        >
          {(viewerId) => <NotificationFeed key={viewerId} viewerId={viewerId} />}
        </ViewerBoundary>
      </div>
    </div>
  );
}
