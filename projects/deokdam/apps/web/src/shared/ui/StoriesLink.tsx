'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

import { track } from '@/shared/analytics/browser';
import { event, type IEventProperties } from '@/shared/analytics/events';

interface IStoriesLinkProps {
  surface: IEventProperties['stories_link_clicked']['surface'];
  children: ReactNode;
  className?: string;
  current?: 'page' | 'location';
}

export function StoriesLink({ surface, children, className, current }: IStoriesLinkProps) {
  return (
    <Link
      href="/stories"
      className={className}
      aria-current={current}
      onClick={() => track(event.StoriesLinkClicked, { surface })}
    >
      {children}
    </Link>
  );
}
