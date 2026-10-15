'use client';

import { House, UserRound } from 'lucide-react';
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
        isActive ? 'text-brand' : 'text-muted hover:text-ink',
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

/**
 * 홈·MY 화면 하단 탭(76px + 안전 영역). `flex min-h-dvh flex-col` 화면의 마지막 자식으로 두고 본문은 flex-1로 늘린다.
 * 터치 기기에서 글자를 입력하는 동안(가상 키보드)에는 숨긴다.
 */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="주요 메뉴"
      data-bottom-nav
      className="sticky bottom-0 z-bottom-nav mt-auto shrink-0 border-t border-line bg-surface pb-(--safe-bottom) desktop:hidden keyboard-open:hidden"
    >
      <ul className="grid h-bottom-nav grid-cols-2">
        <li>
          <NavItem
            href={ROUTES.HOME}
            label="홈"
            icon={<House aria-hidden className="size-6" />}
            isActive={pathname === ROUTES.HOME}
          />
        </li>
        <li>
          <NavItem
            href={ROUTES.ME}
            label="MY"
            icon={<UserRound aria-hidden className="size-6" />}
            isActive={pathname === ROUTES.ME}
          />
        </li>
      </ul>
    </nav>
  );
}
