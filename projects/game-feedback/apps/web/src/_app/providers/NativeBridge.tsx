'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { overlay, useOverlayData } from 'overlay-kit';
import { last } from 'es-toolkit';
import { match } from 'ts-pattern';
import { useRefreshSession } from '@/features/auth';
import { nativeBridgeChannel } from '@/shared/native';
import { backNavigation } from '@/shared/navigation';

export function NativeBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const { mutate: refreshSession } = useRefreshSession();
  const overlays = useOverlayData();
  useEffect(() => {
    const open = last(Object.values(overlays).filter((item) => item.isOpen));
    return nativeBridgeChannel.bind({
      path: pathname + (search ? `?${search}` : ''),
      overlayOpen: !!open,
      onOpen: (path) => router.push(path),
      onActive: refreshSession,
      onDismissOverlay: () => {
        if (!open) return;
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
  }, [overlays, pathname, search, refreshSession, router]);
  return null;
}
