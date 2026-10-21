import type { NativeSyntheticEvent } from 'react-native';

import { vi } from 'vitest';

import {
  decodeNativeMessage,
  NATIVE_EVENT_NAME,
  PROTOCOL_VERSION,
  type TNativeMessage,
  type TWebEventPayload,
  type TWebEventType,
  type TWebRequestType,
} from '@photo-contest/bridge';

import { fakeWebView } from './fake-web-view';

/** 앱이 injectJavaScript로 보낸 스크립트를 jsdom window에서 실행해 웹이 받을 메시지를 꺼낸다. */
export function dispatchedMessages(): TNativeMessage[] {
  const messages: TNativeMessage[] = [];
  function handleNativeEvent(event: Event) {
    const message = decodeNativeMessage((event as CustomEvent<unknown>).detail);
    if (message) messages.push(message);
  }
  window.addEventListener(NATIVE_EVENT_NAME, handleNativeEvent);
  try {
    for (const [script] of fakeWebView.handle.injectJavaScript.mock.calls) new Function(script)();
  } finally {
    window.removeEventListener(NATIVE_EVENT_NAME, handleNativeEvent);
  }
  return messages;
}

export function webRequest(id: string, type: TWebRequestType, payload: unknown) {
  return JSON.stringify({ v: PROTOCOL_VERSION, kind: 'request', id, type, payload });
}

export function webEvent<T extends TWebEventType>(type: T, payload: TWebEventPayload<T>) {
  return JSON.stringify({ v: PROTOCOL_VERSION, kind: 'event', type, payload });
}

export function webResponse(id: string, result: unknown) {
  return JSON.stringify({ v: PROTOCOL_VERSION, kind: 'response', id, ok: true, result });
}

/** WebView 콜백이 받는 NativeSyntheticEvent 모양 */
export function nativeEvent<T>(payload: T) {
  return {
    nativeEvent: payload,
    preventDefault: vi.fn(),
    isDefaultPrevented: () => false,
    persist: () => undefined,
  } as unknown as NativeSyntheticEvent<T> & { preventDefault: ReturnType<typeof vi.fn> };
}

/** WebView 이벤트 공통 필드 */
export function navigationState(url: string, overrides: { canGoBack?: boolean } = {}) {
  return {
    url,
    loading: false,
    title: '',
    canGoBack: overrides.canGoBack ?? false,
    canGoForward: false,
    lockIdentifier: 0,
  };
}
