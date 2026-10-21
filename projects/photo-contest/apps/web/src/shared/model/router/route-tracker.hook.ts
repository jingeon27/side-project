import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

import { resetOverlayNavigation } from './overlay-history.store';
import { routeHistoryStore } from './route-history.store';

const readNavigationType = () => {
  const [entry] = performance.getEntriesByType('navigation');
  return entry && 'type' in entry && typeof entry.type === 'string' ? entry.type : undefined;
};

/** 레이아웃에서 한 번 쓴다. 경로 변경을 세어 앱 안 기록 깊이를 유지한다. */
export function useRouteHistoryTracker() {
  const pathname = usePathname();
  const lastPathname = useRef<string | null>(null);

  useEffect(() => {
    routeHistoryStore.start(readNavigationType());
    const handlePopState = () => routeHistoryStore.markTraversal(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (lastPathname.current === null || lastPathname.current === pathname) {
      lastPathname.current = pathname;
      return;
    }
    lastPathname.current = pathname;
    resetOverlayNavigation();
    routeHistoryStore.record(pathname);
  }, [pathname]);
}
