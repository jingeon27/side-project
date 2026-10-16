'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';
import { backNavigation } from './browser-navigation';

export function BackLink({
  parentOnly = false,
  ...props
}: Omit<ComponentProps<typeof Link>, 'onNavigate'> & { parentOnly?: boolean }) {
  const router = useRouter();
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
