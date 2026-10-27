'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { last } from 'es-toolkit';
import { overlay, useOverlayData } from 'overlay-kit';
import { match } from 'ts-pattern';

import { refreshSessionMutationOptions } from '@/features/auth';
import { nativeBridgeChannel } from '@/shared/native';
import { backNavigation } from '@/shared/navigation';

export function NativeBridge() {
  const client = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const { mutate: refreshSession } = useMutation(refreshSessionMutationOptions(client));
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
        // 시트가 닫기 전환을 마친 뒤 openOverlay가 제거한다.
        overlay.close(open.id);
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
