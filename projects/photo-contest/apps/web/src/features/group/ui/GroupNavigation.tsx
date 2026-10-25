'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ROUTES } from '@/shared/constants/routes';
import { cn } from '@/shared/lib/cn.helper';

function GroupLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <Link
      href={href}
      aria-current={pathname === href ? 'page' : undefined}
      className={cn(
        'flex min-h-touch flex-1 items-center justify-center rounded-full px-3 text-label transition-[background-color,color,transform] active:scale-[0.98]',
        pathname === href
          ? 'bg-accent text-on-accent'
          : 'text-muted hover:bg-surface hover:text-ink active:bg-surface',
      )}
    >
      {children}
    </Link>
  );
}
export function GroupNavigation({ groupId }: { groupId: string }) {
  return (
    <nav
      aria-label="그룹 메뉴"
      className="mx-auto flex w-full max-w-5xl gap-1 rounded-full bg-neutral-soft p-1"
    >
      <GroupLink href={ROUTES.GROUP(groupId)}>게시물</GroupLink>
      <GroupLink href={ROUTES.GROUP_CONTESTS(groupId)}>대회</GroupLink>
      <GroupLink href={ROUTES.GROUP_HALL_OF_FAME(groupId)}>명예의 전당</GroupLink>
    </nav>
  );
}
