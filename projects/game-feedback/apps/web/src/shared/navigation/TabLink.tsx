'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';
import { resolveAppRoute } from '@game-feedback/bridge';
import { feedDestination } from './browser-navigation';

export function TabLink(props: Omit<ComponentProps<typeof Link>, 'onNavigate'>) {
  const router = useRouter();
  const route = typeof props.href === 'string' ? resolveAppRoute(props.href) : null;
  const root = route && ['feed', 'messages', 'settings', 'notifications', 'guide'].includes(route.screen);
  return (
    <Link
      {...props}
      replace={props.replace ?? Boolean(root)}
      onNavigate={(event) => {
        if (route?.screen !== 'feed') return;
        const target = feedDestination(route.path);
        if (target === route.path) return;
        event.preventDefault();
        router.replace(target);
      }}
    />
  );
}
