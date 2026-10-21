'use client';

import { useEffect, type ComponentProps } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
        const next = backNavigation(parentOnly);
        if (next.action === 'back') router.back();
        if (next.action === 'replace') router.replace(next.path);
        if (next.action === 'root' || next.action === 'unhandled') router.replace(String(props.href));
      }}
    />
  );
}
