'use client';

import type { ComponentProps } from 'react';
import Link from 'next/link';

import { registerNextLogicalParent } from './browser-navigation';

/** 현재 화면을 논리적 상위로 등록하고 연다. 열린 화면의 뒤로 가기(브라우저·앱)가 이 화면으로 돌아온다. */
export function ChildLink(props: Omit<ComponentProps<typeof Link>, 'onNavigate'>) {
  const href = typeof props.href === 'string' ? props.href : '';
  return <Link {...props} onNavigate={() => registerNextLogicalParent(href)} />;
}
