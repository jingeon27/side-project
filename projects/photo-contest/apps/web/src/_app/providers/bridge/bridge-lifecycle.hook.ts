import { useEffect, useEffectEvent, useRef } from 'react';
import { usePathname } from 'next/navigation';

import { useApolloClient } from '@apollo/client/react';
import { setTags } from '@sentry/nextjs';
import { match } from 'ts-pattern';

import type { IWebBridge } from '@photo-contest/bridge/web';

import { buildSentryClientTags } from '@/shared/lib/sentry.helper';
import {
  closeTopOverlay,
  getParentRoute,
  hasOpenOverlay,
  resolveBackAction,
  routeHistoryStore,
  useAppRouter,
} from '@/shared/model/router';

const currentPath = () => `${window.location.pathname}${window.location.search}`;

/**
 * 앱 WebView와 웹의 약속(packages/bridge)을 레이아웃에서 한 번 연결한다. 앱 밖에서는 브리지가 아무것도 하지 않는다.
 * - 알림: 마운트 때 app.ready, 경로가 바뀌면 navigation.changed
 * - 앱 요청 navigation.back: 열린 오버레이 → 앱 안 기록 → 상위 화면 순으로 처리하고, 홈이면 앱에 맡긴다(handled false).
 * - 앱 이벤트: navigation.open(딥링크) 이동, app.state active면 보이는 쿼리를 다시 불러온다.
 */
export function useBridgeLifecycle(bridge: IWebBridge | null) {
  const pathname = usePathname();
  const router = useAppRouter();
  const client = useApolloClient();
  const notifiedPathname = useRef<string | null>(null);

  useEffect(() => {
    setTags(buildSentryClientTags(bridge?.app ?? null));
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    if (notifiedPathname.current === null) bridge.notify('app.ready', { path: currentPath() });
    if (notifiedPathname.current !== null && notifiedPathname.current !== pathname)
      bridge.notify('navigation.changed', { path: currentPath() });
    notifiedPathname.current = pathname;
  }, [bridge, pathname]);

  const handleBack = useEffectEvent(() => {
    const { pathname: path } = window.location;
    const action = resolveBackAction({
      hasOverlay: hasOpenOverlay(),
      depth: routeHistoryStore.getDepth(),
      pathname: path,
      parentHref: getParentRoute(path),
    });
    return match(action)
      .with({ type: 'close-overlay' }, () => ({ handled: closeTopOverlay() }))
      .with({ type: 'history-back' }, () => {
        router.back();
        return { handled: true };
      })
      .with({ type: 'replace' }, ({ href }) => {
        router.replace(href);
        return { handled: true };
      })
      .with({ type: 'exit' }, () => ({ handled: false }))
      .exhaustive();
  });
  useEffect(() => {
    if (!bridge) return;
    return bridge.handleRequest('navigation.back', handleBack);
  }, [bridge]);

  const openPath = useEffectEvent((path: string) => router.push(path));
  const refreshActive = useEffectEvent(async () => {
    try {
      await client.refetchQueries({ include: 'active' });
    } catch {
      // 각 쿼리의 실패는 그 화면이 보여 준다.
    }
  });
  useEffect(() => {
    if (!bridge) return;
    // 프로토콜이 같은 origin의 상대 경로만 통과시킨다.
    const stopOpen = bridge.onEvent('navigation.open', ({ path }) => openPath(path));
    const stopState = bridge.onEvent('app.state', ({ state }) => {
      if (state === 'active') void refreshActive();
    });
    return () => {
      stopOpen();
      stopState();
    };
  }, [bridge]);
}
