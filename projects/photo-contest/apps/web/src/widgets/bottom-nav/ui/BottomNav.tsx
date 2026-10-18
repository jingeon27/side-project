'use client';

import { Compass, House, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { ROUTES } from '@/shared/constants/routes';
import { cn } from '@/shared/lib/cn.helper';

function NavItem({
  href,
  label,
  icon,
  isActive,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex h-full flex-col items-center justify-center gap-1 text-micro transition-colors active:bg-sunken',
        isActive ? 'font-bold text-ink' : 'text-muted hover:text-ink',
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

/**
 * 홈·MY 화면 하단 탭(76px + 안전 영역). `flex min-h-dvh flex-col` 화면의 마지막 자식으로 두고 본문은 flex-1로 늘린다.
 * 입력 포커스를 옮길 때 버튼이 움직이지 않도록 메뉴 공간을 유지한 채 숨긴다.
 */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="주요 메뉴"
      data-bottom-nav
      className="sticky bottom-0 z-bottom-nav mt-auto shrink-0 border-t border-line bg-surface pb-(--safe-bottom) desktop:hidden keyboard-open:invisible"
    >
      <ul className="grid h-bottom-nav grid-cols-3">
        <li>
          <NavItem
            href={ROUTES.HOME}
            label="홈"
            icon={<House aria-hidden className="size-6" strokeWidth={pathname === ROUTES.HOME ? 2.5 : 1.7} />}
            isActive={pathname === ROUTES.HOME}
          />
        </li>
        <li>
          <NavItem
            href={ROUTES.EXPLORE}
            label="탐색"
            icon={
              <Compass aria-hidden className="size-6" strokeWidth={pathname === ROUTES.EXPLORE ? 2.5 : 1.7} />
            }
            isActive={pathname === ROUTES.EXPLORE}
          />
        </li>
        <li>
          <NavItem
            href={ROUTES.ME}
            label="MY"
            icon={
              <UserRound aria-hidden className="size-6" strokeWidth={pathname === ROUTES.ME ? 2.5 : 1.7} />
            }
            isActive={pathname === ROUTES.ME}
          />
        </li>
      </ul>
    </nav>
  );
}
