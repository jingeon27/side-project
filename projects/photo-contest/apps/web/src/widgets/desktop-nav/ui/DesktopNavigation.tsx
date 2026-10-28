'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Compass, Heart, House, UserRound } from 'lucide-react';

import { ROUTES } from '@/shared/constants/routes';
import { cn } from '@/shared/lib/cn.helper';
import { LegalLinks } from '@/shared/ui/@core/legal-links';
import { BrandIcon } from '@/shared/ui/@core/top-app-bar';

/** 세션을 만드는 시작 화면은 메뉴 없이 보여 준다. */
const PATHS_WITHOUT_NAVIGATION = new Set<string>([ROUTES.SIGN]);

function NavigationLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-touch items-center gap-4 rounded-full px-4 py-3 text-body transition-[background-color,color,transform] active:scale-[0.98]',
        active
          ? 'bg-accent-soft font-bold text-accent-ink hover:bg-accent/20 active:bg-accent/25'
          : 'text-muted hover:bg-sunken hover:text-ink active:bg-neutral-soft',
      )}
    >
      {children}
    </Link>
  );
}

/**
 * 데스크톱(1024px 이상) 왼쪽 고정 메뉴. 루트 레이아웃이 한 번만 그려 화면을 옮기거나 불러오는 동안에도 남는다.
 * `#pc-main`은 `[data-desktop-nav]`가 있을 때만 메뉴 폭만큼 비켜 그린다.
 */
export function DesktopNavigation() {
  const pathname = usePathname();
  if (PATHS_WITHOUT_NAVIGATION.has(pathname)) return null;
  return (
    <aside
      data-desktop-nav
      className="absolute inset-y-0 left-0 z-app-bar hidden w-48 border-r border-line bg-surface desktop:block wide:w-56"
    >
      <nav
        aria-label="주요 메뉴"
        className="sticky top-0 flex h-dvh flex-col gap-2 overflow-y-auto px-4 py-6 wide:px-5"
      >
        <Link
          href={ROUTES.HOME}
          aria-label="별사대 홈"
          className="mb-8 flex min-h-touch items-center gap-2.5 px-3 text-title-lg font-extrabold tracking-tighter text-ink active:opacity-60"
        >
          <BrandIcon className="size-8" />
          별사대
        </Link>
        <NavigationLink href={ROUTES.HOME} active={pathname === ROUTES.HOME}>
          <House aria-hidden className="size-6" strokeWidth={pathname === ROUTES.HOME ? 2.5 : 1.7} />홈
        </NavigationLink>
        <NavigationLink href={ROUTES.EXPLORE} active={pathname === ROUTES.EXPLORE}>
          <Compass aria-hidden className="size-6" strokeWidth={pathname === ROUTES.EXPLORE ? 2.5 : 1.7} />
          탐색
        </NavigationLink>
        <NavigationLink href={ROUTES.ME} active={pathname === ROUTES.ME}>
          <UserRound aria-hidden className="size-6" strokeWidth={pathname === ROUTES.ME ? 2.5 : 1.7} />
          MY
        </NavigationLink>
        <NavigationLink href={ROUTES.NOTIFICATIONS} active={pathname === ROUTES.NOTIFICATIONS}>
          <Heart aria-hidden className="size-6" strokeWidth={1.7} />
          알림
        </NavigationLink>
        <div className="mt-auto px-3 text-caption text-subtle">
          <p className="text-label text-muted">가볍게 올리고, 같이 웃어요.</p>
          <p className="mt-2">사진 · 동영상 · 합성</p>
          <LegalLinks className="mt-3 gap-x-2" />
          <p className="mt-6 text-micro">© 별사대</p>
        </div>
      </nav>
    </aside>
  );
}
