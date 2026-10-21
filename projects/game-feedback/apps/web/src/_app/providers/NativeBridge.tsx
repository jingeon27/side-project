'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { last } from 'es-toolkit';
import { overlay, useOverlayData } from 'overlay-kit';
import { match } from 'ts-pattern';

import { useRefreshSession, useSession } from '@/features/auth';
import { nativeBridgeChannel } from '@/shared/native';
import { backNavigation } from '@/shared/navigation';

export function NativeBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const { mutate: refreshSession } = useRefreshSession();
  const overlays = useOverlayData();
  const { session } = useSession();
  useEffect(() => {
    const open = last(Object.values(overlays).filter((item) => item.isOpen));
    return nativeBridgeChannel.bind({
      path: pathname + (search ? `?${search}` : ''),
      overlayOpen: !!open,
      onOpen: (path) => router.push(path),
      onActive: refreshSession,
      onDismissOverlay: () => {
        if (!open || session?.needsOnboarding) return;
        overlay.close(open.id);
        overlay.unmount(open.id);
      },
      onBack: () =>
        match(backNavigation())
          .with({ action: 'back' }, () => {
            router.back();
            return { handled: true };
          })
          .with({ action: 'replace' }, ({ path }) => {
            router.replace(path);
            return { handled: true };
          })
          .with({ action: 'root' }, () => ({ handled: false, atRoot: true }))
          .with({ action: 'unhandled' }, () => ({ handled: false }))
          .exhaustive(),
    });
  }, [overlays, pathname, search, refreshSession, router, session?.needsOnboarding]);
  return null;
}
