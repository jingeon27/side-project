'use client';

import type { ReactNode } from 'react';

import { buttonVariants } from '@side/design-system';

import { TabLink } from '@/shared/navigation';

/** 홈은 루트 탭이라 하단 메뉴와 같이 기록을 쌓지 않고 마지막 피드 필터로 돌아간다. */
export function GuideHomeLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <TabLink href={href} className={buttonVariants({ variant: 'primary', size: 'md' })}>
      {children}
    </TabLink>
  );
}
