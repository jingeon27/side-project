'use client';

import Link from 'next/link';

import { Bell } from 'lucide-react';

import { ROUTES } from '@/shared/constants/routes';

export function NotificationLink({ count = 0 }: { count?: number }) {
  return (
    <Link
      href={ROUTES.NOTIFICATIONS}
      aria-label={`알림 ${count}개`}
      className="relative flex size-touch items-center justify-center rounded-control text-ink active:bg-sunken"
    >
      <Bell aria-hidden className="size-6" strokeWidth={1.7} />
      {count > 0 ? (
        <span
          aria-hidden
          className="absolute top-0 right-0 flex min-h-4 min-w-4 items-center justify-center rounded-badge bg-brand px-1 text-micro text-on-brand"
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
