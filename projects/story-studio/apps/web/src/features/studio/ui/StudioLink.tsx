'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

import { match } from 'ts-pattern';

import { trackStudioEvent, type TStudioSource } from '../../../shared/analytics';

export function StudioLink({
  source,
  className,
  children,
}: {
  source: TStudioSource;
  className?: string;
  children: ReactNode;
}) {
  const href = match(source)
    .with('blank', () => '/studio')
    .with('sample', () => '/studio?sample=1')
    .with('demo', () => '/studio?demo=bundled')
    .otherwise((format) => `/studio?format=${format}`);
  return (
    <Link
      href={href}
      className={className}
      onClick={() => void trackStudioEvent('landing_start_clicked', { source })}
    >
      {children}
    </Link>
  );
}
