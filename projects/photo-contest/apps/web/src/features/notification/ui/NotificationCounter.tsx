'use client';

import { useEffect } from 'react';

import { useBackgroundQuery, useReadQuery, type QueryRef } from '@apollo/client/react';

import { NotificationUnreadCountDocument, type NotificationUnreadCountQuery } from '@/shared/api/generated';
import { AsyncBoundary } from '@/shared/ui/@core/async-boundary';

import { NotificationLink } from './NotificationLink';

function Count({ queryRef }: { queryRef: QueryRef<NotificationUnreadCountQuery> }) {
  const { data } = useReadQuery(queryRef);
  return <NotificationLink count={data.notificationUnreadCount} />;
}

export function NotificationCounter() {
  const [queryRef, { refetch }] = useBackgroundQuery(NotificationUnreadCountDocument);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      void refetch().catch(() => undefined);
    };
    const timer = window.setInterval(refresh, 15_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [refetch]);
  return (
    <AsyncBoundary
      fallback={<NotificationLink />}
      onRetry={() => refetch()}
      renderError={() => <NotificationLink />}
    >
      <Count queryRef={queryRef} />
    </AsyncBoundary>
  );
}
