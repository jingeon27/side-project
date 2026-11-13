'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { last } from 'es-toolkit';
import { overlay, useOverlayData } from 'overlay-kit';
import { match } from 'ts-pattern';

import { refreshSessionMutationOptions } from '@/features/auth';
import { nativeBridgeChannel } from '@/shared/native';
import { backNavigation, confirmNavigation, confirmOverlayClose } from '@/shared/navigation';

export function NativeBridge() {
  const client = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const { mutate: refreshSession } = useMutation(refreshSessionMutationOptions(client));
  const overlays = useOverlayData();
  useEffect(() => {
    const open = last(Object.values(overlays).filter((item) => item.isOpen));
    const currentPath = pathname + (search ? `?${search}` : '');
    return nativeBridgeChannel.bind({
      path: currentPath,
      overlayOpen: !!open,
      onOpen: (path) => {
        if (path === currentPath || confirmNavigation()) router.push(path);
      },
      onActive: refreshSession,
      onDismissOverlay: () => {
        // 고친 내용이 있는 수정 시트처럼 그 오버레이 안의 초안만 닫기 확인을 거친다. 취소하면 시트를 그대로 둔다.
        if (!open || !confirmOverlayClose(open.id)) return;
        // 시트가 닫기 전환을 마친 뒤 openOverlay가 제거한다.
        overlay.close(open.id);
      },
      // 이동은 채널이 back-result를 보낸 뒤에 실행한다. 이탈 확인 창이 네이티브의 800ms 응답 대기를 넘기지 않는다.
      onBack: () =>
        match(backNavigation())
          .with({ action: 'back' }, () => ({ handled: true, navigate: () => router.back() }))
          .with({ action: 'replace' }, ({ path }) => ({
            handled: true,
            navigate: () => {
              if (confirmNavigation()) router.replace(path);
            },
          }))
          .with({ action: 'root' }, () => ({ handled: false, atRoot: true }))
          .with({ action: 'unhandled' }, () => ({ handled: false }))
          .exhaustive(),
    });
  }, [overlays, pathname, search, refreshSession, router]);
  return null;
}
