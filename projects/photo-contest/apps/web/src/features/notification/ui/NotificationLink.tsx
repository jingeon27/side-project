'use client';

import Link from 'next/link';

import { Heart } from 'lucide-react';

import { ROUTES } from '@/shared/constants/routes';

export function NotificationLink({ count = 0 }: { count?: number }) {
  const shown = count > 99 ? '99+' : String(count);
  return (
    <Link
      href={ROUTES.NOTIFICATIONS}
      className="relative flex size-touch items-center justify-center rounded-control text-ink active:bg-sunken"
    >
      <Heart aria-hidden className="size-6" strokeWidth={1.7} />
      {/*
       * 이름은 LikeToggle처럼 aria-label 대신 숨긴 글자 하나로 둔다. aria-label이면 보이는 '1'과 이름의 낱말 '1개'가
       * 달라 WCAG 2.5.3 검사에서 어긋나고, 숨긴 글자를 나누면 브라우저가 절대 위치 요소마다 공백을 넣어 '알림 1 개'로 읽는다.
       */}
      <span className="sr-only">{`알림 ${shown}개`}</span>
      {count > 0 ? (
        <span
          aria-hidden
          className="absolute top-0 right-0 flex min-h-4 min-w-4 items-center justify-center rounded-badge bg-brand px-1 text-micro text-on-brand"
        >
          {shown}
        </span>
      ) : null}
    </Link>
  );
}
