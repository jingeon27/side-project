'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

import { ArrowRight } from 'lucide-react';

import type { TTopic } from '@/content/topics';
import { track } from '@/shared/analytics/browser';
import { event } from '@/shared/analytics/events';

interface IReadingLinkProps {
  topic?: TTopic;
  surface: 'hero' | 'topics' | 'episode';
  className?: string;
  children: ReactNode;
}

export function ReadingLink({ topic, surface, className, children }: IReadingLinkProps) {
  return (
    <Link
      href={topic ? '/reading?topic=' + topic : '/reading'}
      className={className}
      onClick={() => track(event.StartClicked, { surface, topic })}
    >
      {children}
      <ArrowRight size={17} aria-hidden />
    </Link>
  );
}
