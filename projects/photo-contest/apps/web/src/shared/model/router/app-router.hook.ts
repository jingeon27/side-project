import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { isOverlayEntryCurrent, markOverlayNavigation } from './overlay-history.store';
import { routeHistoryStore } from './route-history.store';

type TNavigateOptions = Parameters<ReturnType<typeof useRouter>['push']>[1];

const changesPathname = (href: string) =>
  new URL(href, window.location.href).pathname !== window.location.pathname;

/**
 * next/navigation의 router를 감싼다. 화면 이동은 이 훅으로만 한다.
 * - 앱 안 기록 깊이(route history)를 push/replace에 맞게 센다.
 * - 바텀시트가 쌓은 history 항목 위에서 이동하면 그 항목을 replace해 뒤로 가기 기록에 빈 항목을 남기지 않는다.
 */
export function useAppRouter() {
  const router = useRouter();
  return useMemo(() => {
    const push = (href: string, options?: TNavigateOptions) => {
      if (changesPathname(href)) routeHistoryStore.expect('push');
      if (isOverlayEntryCurrent()) {
        markOverlayNavigation();
        router.replace(href, options);
        return;
      }
      router.push(href, options);
    };
    const replace = (href: string, options?: TNavigateOptions) => {
      if (changesPathname(href)) routeHistoryStore.expect('replace');
      if (isOverlayEntryCurrent()) markOverlayNavigation();
      router.replace(href, options);
    };
    return { push, replace, back: router.back, refresh: router.refresh, prefetch: router.prefetch };
  }, [router]);
}
