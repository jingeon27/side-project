import { useCallback } from 'react';
import { usePathname } from 'next/navigation';

import { useAppRouter } from './app-router.hook';
import { leaveAfterConfirm } from './leave-guard.store';
import { useParentRoute } from './parent-route.store';
import { routeHistoryStore } from './route-history.store';

/**
 * 화면 상단 뒤로 가기. 앱 안 기록이 있으면 이전 화면으로, 없으면(카카오톡 링크 등으로 바로 들어온 경우) 상위 화면으로 간다.
 * 같은 상위 화면을 앱(안드로이드) 뒤로 가기도 쓰도록 등록한다. 화면이 떠나기 전 확인을 등록했으면 묻고 나서 간다.
 */
export function useBackNavigation(parentHref: string) {
  const router = useAppRouter();
  const pathname = usePathname();
  useParentRoute(parentHref);
  return useCallback(() => {
    leaveAfterConfirm(pathname, () => {
      if (routeHistoryStore.getDepth() > 0) {
        router.back();
        return;
      }
      router.push(parentHref);
    });
  }, [router, parentHref, pathname]);
}
