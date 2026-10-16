'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { overlay, useOverlayData } from 'overlay-kit';
import { BRIDGE_EVENT, parseNativeMessage, WebPathSchema } from '@game-feedback/bridge';
import { useRefreshSession, useSession } from '@/features/auth';
import { isNativeApp, postToNative, NATIVE_BOOTSTRAP_EVENT } from '@/shared/native';
import { backNavigation } from '@/shared/navigation';

export function NativeBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const { mutate: refreshSession } = useRefreshSession();
  const overlays = useOverlayData();
  const { session } = useSession();
  useEffect(() => {
    function handleReady() {
      if (!isNativeApp()) return;
      postToNative({ type: 'ready' });
      const path = WebPathSchema.safeParse(window.location.pathname + window.location.search);
      if (path.success) postToNative({ type: 'location', path: path.data });
      postToNative({
        type: 'navigation-state',
        overlayOpen: Object.values(overlays).some((item) => item.isOpen),
      });
    }
    function handleMessage(event: Event) {
      if (!isNativeApp()) return;
      const message = parseNativeMessage((event as CustomEvent<unknown>).detail);
      if (!message) return;
      if (message.type === 'open') {
        const current = WebPathSchema.safeParse(window.location.pathname + window.location.search);
        if (!current.success || current.data !== message.path) router.push(message.path);
      }
      if (message.type === 'state' && message.state === 'active') refreshSession();
      if (message.type === 'back') {
        const open = Object.values(overlays)
          .filter((item) => item.isOpen)
          .at(-1);
        if (open) {
          if (!session?.needsOnboarding) {
            overlay.close(open.id);
            overlay.unmount(open.id);
          }
          postToNative({ type: 'back-result', id: message.id, handled: true });
          return;
        }
        const next = backNavigation();
        if (next.action === 'back') router.back();
        if (next.action === 'replace') router.replace(next.path);
        postToNative({
          type: 'back-result',
          id: message.id,
          handled: next.action === 'back' || next.action === 'replace',
          ...(next.action === 'root' ? { atRoot: true } : {}),
        });
      }
    }
    window.addEventListener(BRIDGE_EVENT, handleMessage);
    window.addEventListener(NATIVE_BOOTSTRAP_EVENT, handleReady);
    handleReady();
    return () => {
      window.removeEventListener(BRIDGE_EVENT, handleMessage);
      window.removeEventListener(NATIVE_BOOTSTRAP_EVENT, handleReady);
    };
  }, [overlays, pathname, search, refreshSession, router, session?.needsOnboarding]);
  return null;
}
