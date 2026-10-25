'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ChevronLeft, Compass, Heart, House, UserRound } from 'lucide-react';

import { ROUTES } from '../../../constants/routes';
import { cn } from '../../../lib/cn.helper';
import { useBackNavigation } from '../../../model/router';
import { IconButton } from '../icon-button';
import { LegalLinks } from '../legal-links';
import { BrandIcon } from './BrandIcon';

const APP_BAR_CLASS_NAME = 'sticky top-0 z-app-bar shrink-0 border-b border-line bg-surface pt-(--safe-top)';

function DesktopNavigation() {
  const pathname = usePathname();
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
          className="mb-8 flex min-h-touch items-center gap-2 px-3 text-title-lg tracking-tighter text-ink active:opacity-60"
        >
          <BrandIcon />
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

function NavigationLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-touch items-center gap-4 rounded-control px-3 py-3 text-body transition-colors hover:bg-sunken active:bg-neutral-soft',
        active ? 'font-bold text-ink' : 'text-ink',
      )}
    >
      {children}
    </Link>
  );
}

interface ITopAppBarProps {
  /** 화면 제목(h1). 길면 한 줄로 자른다. */
  title: string;
  /** 있으면 뒤로 가기 버튼을 보여 준다. 앱 안 기록이 없을 때 갈 상위 화면(대회 → 그룹, 그룹 → 탐색). */
  backHref?: string;
  /** 오른쪽 아이콘 버튼들(공유 등) */
  actions?: ReactNode;
  className?: string;
}

function BackButton({ href }: { href: string }) {
  const handleBack = useBackNavigation(href);
  return (
    <IconButton label="뒤로 가기" onClick={handleBack}>
      <ChevronLeft className="size-6" />
    </IconButton>
  );
}

/** 화면 상단 앱바(60px). 뒤로 가기 + 제목 + 오른쪽 행동. */
export function TopAppBar({ title, backHref, actions, className }: ITopAppBarProps) {
  return (
    <>
      <DesktopNavigation />
      <header className={cn(APP_BAR_CLASS_NAME, className)}>
        <div className="flex h-app-bar items-center gap-1 px-2 desktop:gap-4 desktop:px-6">
          {backHref ? <BackButton href={backHref} /> : null}
          <h1 className={cn('line-clamp-1 min-w-0 flex-1 text-title text-ink', backHref ? 'px-1' : 'px-3')}>
            {title}
          </h1>
          {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
        </div>
      </header>
    </>
  );
}

export function HomeAppBar({ actions, className }: { actions?: ReactNode; className?: string }) {
  return <TopAppBar title="홈" className={className} actions={actions} />;
}
