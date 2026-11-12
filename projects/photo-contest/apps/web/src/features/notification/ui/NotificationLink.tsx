'use client';

import Link from 'next/link';

import { Heart } from 'lucide-react';

import { ROUTES } from '@/shared/constants/routes';

export function NotificationLink({ count = 0 }: { count?: number }) {
  return (
    <Link
      href={ROUTES.NOTIFICATIONS}
      className="relative flex size-touch items-center justify-center rounded-control text-ink active:bg-sunken"
    >
      <Heart aria-hidden className="size-6" strokeWidth={1.7} />
      {/* 보이는 개수를 접근 이름에 그대로 넣는다(WCAG 2.5.3). aria-label('알림 1개')로 따로 쓰면 보이는 '1'과 낱말이 어긋난다. */}
      <span className="sr-only">알림</span>
      {count > 0 ? (
        <>
          {' '}
          <span className="absolute top-0 right-0 flex min-h-4 min-w-4 items-center justify-center rounded-badge bg-brand px-1 text-micro text-on-brand">
            {count > 99 ? '99+' : count}
          </span>
          <span className="sr-only">개</span>
        </>
      ) : null}
    </Link>
  );
}
