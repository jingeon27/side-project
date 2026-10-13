'use client';

import { Camera, ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../../lib/cn.helper';
import { useBackNavigation } from '../../../model/router';
import { IconButton } from '../icon-button';

const APP_BAR_CLASS_NAME = 'sticky top-0 z-app-bar shrink-0 border-b border-line bg-surface pt-(--safe-top)';

interface ITopAppBarProps {
  /** 화면 제목(h1). 길면 한 줄로 자른다. */
  title: string;
  /** 있으면 뒤로 가기 버튼을 보여 준다. 앱 안 기록이 없을 때 갈 상위 화면(대회 → 그룹, 그룹 → 홈). */
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
    <header className={cn(APP_BAR_CLASS_NAME, className)}>
      <div className="flex h-app-bar items-center gap-1 px-2">
        {backHref ? <BackButton href={backHref} /> : null}
        <h1 className={cn('line-clamp-1 min-w-0 flex-1 text-title text-ink', backHref ? 'px-1' : 'px-3')}>
          {title}
        </h1>
        {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
      </div>
    </header>
  );
}

/** 홈 화면의 브랜드 앱바 */
export function BrandAppBar({ actions, className }: { actions?: ReactNode; className?: string }) {
  return (
    <header className={cn(APP_BAR_CLASS_NAME, className)}>
      <div className="flex h-app-bar items-center gap-2 px-4">
        <h1 className="flex min-w-0 flex-1 items-center gap-2 text-title text-ink">
          <span
            aria-hidden
            className="flex size-9 items-center justify-center rounded-control bg-brand text-on-brand"
          >
            <Camera className="size-5" />
          </span>
          웃긴순간
          <span className="rounded-badge bg-accent px-1.5 py-0.5 text-micro text-accent-ink">BETA</span>
        </h1>
        {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
      </div>
    </header>
  );
}
