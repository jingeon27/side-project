'use client';

import { useEffect, type ComponentProps } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { match, P } from 'ts-pattern';

import { backNavigation, registerLogicalParent } from './browser-navigation';

export function BackLink({
  parentOnly = false,
  logicalParent,
  ...props
}: Omit<ComponentProps<typeof Link>, 'onNavigate'> & { parentOnly?: boolean; logicalParent?: string }) {
  const router = useRouter();
  useEffect(() => (logicalParent ? registerLogicalParent(logicalParent) : undefined), [logicalParent]);
  return (
    <Link
      {...props}
      onNavigate={(event) => {
        event.preventDefault();
        match(backNavigation(parentOnly))
          .with({ action: 'back' }, () => router.back())
          .with({ action: 'replace' }, ({ path }) => router.replace(path))
          .with({ action: P.union('root', 'unhandled') }, () => router.replace(String(props.href)))
          .exhaustive();
      }}
    />
  );
}
