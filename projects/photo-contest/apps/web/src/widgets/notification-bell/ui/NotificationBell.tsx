'use client';

import { ViewerBoundary } from '@/features/auth';
import { NotificationCounter, NotificationLink } from '@/features/notification';

export function NotificationBell() {
  return (
    <ViewerBoundary guest={<NotificationLink />} fallback={<NotificationLink />}>
      {() => <NotificationCounter />}
    </ViewerBoundary>
  );
}
