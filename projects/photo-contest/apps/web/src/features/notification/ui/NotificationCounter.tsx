'use client';

import { useEffect } from 'react';

import { useBackgroundQuery, useQuery, useReadQuery, type QueryRef } from '@apollo/client/react';

import { NotificationUnreadCountDocument, type NotificationUnreadCountQuery } from '@/shared/api/generated';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';

import { NotificationLink } from './NotificationLink';

const POLL_INTERVAL_MS = 15_000;
const isHidden = () => document.visibilityState !== 'visible';

function Count({ queryRef }: { queryRef: QueryRef<NotificationUnreadCountQuery> }) {
  const { data } = useReadQuery(queryRef);
  return <NotificationLink count={data.notificationUnreadCount} />;
}

/**
 * 표시하는 Suspense 조회와 주기 갱신을 나눈다. 같은 정규화 캐시만 갱신하므로 개수를 보이는 동안 fallback으로 바뀌지 않는다.
 * 화면이 가려져 있으면 건너뛰고 다시 보이면 바로 받는다. 한 번 실패해도 보던 개수를 두고 다음 주기에 다시 받는다.
 */
function NotificationCountSync() {
  const { refetch } = useQuery(NotificationUnreadCountDocument, {
    ssr: false,
    pollInterval: POLL_INTERVAL_MS,
    skipPollAttempt: isHidden,
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: false,
  });
  useEffect(() => {
    const refresh = () => {
      if (isHidden()) return;
      void refetch().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [refetch]);
  return null;
}

export function NotificationCounter() {
  const [queryRef, { refetch }] = useBackgroundQuery(NotificationUnreadCountDocument);
  return (
    <>
      <NotificationCountSync />
      <AsyncBoundary
        fallback={<NotificationLink />}
        onRetry={() => refetch()}
        renderError={() => <NotificationLink />}
      >
        <Count queryRef={queryRef} />
      </AsyncBoundary>
    </>
  );
}
