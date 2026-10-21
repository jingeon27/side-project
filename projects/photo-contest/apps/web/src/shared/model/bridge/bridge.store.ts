import { createWebBridge, type IWebBridge } from '@photo-contest/bridge/web';

let bridge: IWebBridge | null = null;

/**
 * 브라우저에서 처음 부를 때 한 번만 만든다(서버 렌더링에서는 null).
 * 앱 밖에서도 만들어지며, 그때 request는 UNSUPPORTED로 거절되고 notify는 아무것도 하지 않는다.
 */
export function getWebBridge(): IWebBridge | null {
  if (typeof window === 'undefined') return null;
  bridge ??= createWebBridge(window);
  return bridge;
}
