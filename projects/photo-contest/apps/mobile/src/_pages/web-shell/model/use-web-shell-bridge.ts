import { useEffect, useState } from 'react';

import type { TWebEventPayload } from '@photo-contest/bridge';
import {
  buildNativeDispatchScript,
  createNativeRouter,
  type INativeRouter,
  type TNativeCapabilities,
} from '@photo-contest/bridge/native';

import { WEB_ORIGIN } from '@/shared/config/env';
import { useLatest } from '@/shared/lib/use-latest';

import type { IWebViewChannel } from './web-view-channel';

export interface IWebEventHandlers {
  onAppReady: (payload: TWebEventPayload<'app.ready'>) => void;
  onNavigationChanged: (payload: TWebEventPayload<'navigation.changed'>) => void;
  onAuthChanged: (payload: TWebEventPayload<'auth.changed'>) => void;
}

interface IUseWebShellBridgeOptions {
  channel: IWebViewChannel;
  capabilities: TNativeCapabilities;
  handlers: IWebEventHandlers;
}

/** WebView 하나에 붙는 네이티브 라우터. 웹 origin에서 온 메시지만 처리하고 응답은 injectJavaScript로 보낸다. */
export function useWebShellBridge({ channel, capabilities, handlers }: IUseWebShellBridgeOptions) {
  const handlersRef = useLatest(handlers);
  // 라우터는 send·onEvent를 메시지를 주고받을 때만 부른다. 만들 때(렌더 중)는 ref를 읽지 않는다.
  // eslint-disable-next-line react-hooks/refs
  const [router] = useState<INativeRouter>(() =>
    createNativeRouter({
      allowedOrigin: WEB_ORIGIN,
      capabilities,
      send: (message) => channel.injectJavaScript(buildNativeDispatchScript(message)),
      onEvent: {
        'app.ready': (payload) => handlersRef.current.onAppReady(payload),
        'navigation.changed': (payload) => handlersRef.current.onNavigationChanged(payload),
        'auth.changed': (payload) => handlersRef.current.onAuthChanged(payload),
      },
    }),
  );

  // 화면이 사라지면 웹 응답을 기다리던 요청(뒤로 가기)을 끝낸다. 라우터 자체는 다시 써도 된다.
  useEffect(() => () => router.dispose(), [router]);

  return router;
}
