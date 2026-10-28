'use client';

import { ViewerBoundary } from '@/features/auth';
import { NotificationCounter, NotificationLink } from '@/features/notification';
import { ClientOnly } from '@/shared/ui/@core/async-boundary';

export function NotificationBell() {
  return (
    <ClientOnly fallback={<NotificationLink />}>
      <ViewerBoundary guest={<NotificationLink />} fallback={<NotificationLink />}>
        {() => <NotificationCounter />}
      </ViewerBoundary>
    </ClientOnly>
  );
}
