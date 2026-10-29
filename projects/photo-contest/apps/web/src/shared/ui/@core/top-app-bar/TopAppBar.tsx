'use client';

import type { ReactNode } from 'react';

import { ChevronLeft } from 'lucide-react';

import { cn } from '../../../lib/cn.helper';
import { useBackNavigation } from '../../../model/router';
import { IconButton } from '../icon-button';
import { BrandIcon } from './BrandIcon';

const APP_BAR_CLASS_NAME = 'sticky top-0 z-app-bar shrink-0 border-b border-line bg-surface pt-(--safe-top)';

interface ITopAppBarProps {
  /** 화면 제목(h1). 길면 한 줄로 자른다. */
  title: string;
  /** 있으면 뒤로 가기 버튼을 보여 준다. 앱 안 기록이 없을 때 갈 상위 화면(대회 → 그룹, 그룹 → 탐색). */
  backHref?: string;
  /** 오른쪽 아이콘 버튼들(공유 등) */
  actions?: ReactNode;
  className?: string;
  showBrand?: boolean;
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
export function TopAppBar({ title, backHref, actions, className, showBrand = false }: ITopAppBarProps) {
  return (
    <header className={cn(APP_BAR_CLASS_NAME, className)}>
      <div className="flex h-app-bar items-center gap-1 px-2 desktop:gap-4 desktop:px-6">
        {backHref ? <BackButton href={backHref} /> : null}
        <h1
          aria-label={showBrand ? title : undefined}
          className={cn('min-w-0 flex-1 text-title text-ink', backHref ? 'px-1' : 'px-3')}
        >
          {showBrand ? (
            <span
              aria-hidden
              className="flex items-center gap-2 text-title-lg font-extrabold tracking-tighter"
            >
              <BrandIcon className="size-7" />
              별사대
            </span>
          ) : (
            <span className="line-clamp-1">{title}</span>
          )}
        </h1>
        {actions ? <div className="flex shrink-0 items-center">{actions}</div> : null}
      </div>
    </header>
  );
}

export function HomeAppBar({ actions, className }: { actions?: ReactNode; className?: string }) {
  return <TopAppBar title="홈" showBrand className={className} actions={actions} />;
}
