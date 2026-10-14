import type { TNativeAppInfo } from '@photo-contest/bridge';
import type { IWebBridge } from '@photo-contest/bridge/web';
import { createContext, use, useSyncExternalStore } from 'react';

/** app의 BridgeProvider가 브라우저에서 만든 브리지를 넣는다. 서버 렌더링에서는 null. */
export const BridgeContext = createContext<IWebBridge | null>(null);

/** 웹 브리지. 서버 렌더링 중이거나 Provider 밖이면 null. 앱 밖이어도 null이 아니다(요청이 UNSUPPORTED로 거절될 뿐). */
export function useBridge() {
  return use(BridgeContext);
}

const subscribeNothing = () => () => undefined;
const getServerAppInfo = () => null;

/**
 * 앱 WebView 안이면 앱 정보(플랫폼·버전·지원 기능), 브라우저면 null.
 * 서버 렌더링과 첫 hydration에서는 항상 null이라 화면이 어긋나지 않는다. 화면 모양에만 쓰고 권한 판단에는 쓰지 않는다.
 */
export function useNativeApp(): TNativeAppInfo | null {
  const bridge = useBridge();
  return useSyncExternalStore(subscribeNothing, () => bridge?.app ?? null, getServerAppInfo);
}
