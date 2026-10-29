import {
  APP_MARKER_KEY,
  BRIDGE_ERROR_CODE,
  createMessageId,
  decodeNativeMessage,
  encodeMessage,
  errorResponse,
  NATIVE_EVENT,
  NATIVE_EVENT_NAME,
  NATIVE_REQUEST,
  parseNativeAppInfo,
  PROTOCOL_VERSION,
  successResponse,
  WEB_EVENT,
  WEB_REQUEST,
  type TBridgeErrorCode,
  type TNativeAppInfo,
  type TNativeEventPayload,
  type TNativeEventType,
  type TNativeRequestPayload,
  type TNativeRequestResult,
  type TNativeRequestType,
  type TWebEventPayload,
  type TWebEventType,
  type TWebMessage,
  type TWebRequestPayload,
  type TWebRequestResult,
  type TWebRequestType,
} from './protocol';

interface IReactNativeWebView {
  postMessage: (message: string) => void;
}

/** 브리지가 쓰는 window의 최소 모양. 테스트에서 jsdom window를 그대로 넘긴다. */
export type TBridgeWindow = Pick<Window, 'addEventListener' | 'removeEventListener'> & {
  ReactNativeWebView?: IReactNativeWebView;
  [APP_MARKER_KEY]?: unknown;
};

export class BridgeError extends Error {
  constructor(
    readonly code: TBridgeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

/** 앱 WebView 안이면 앱 정보를, 브라우저면 null을 돌려준다. */
export function readNativeAppInfo(win: TBridgeWindow | undefined): TNativeAppInfo | null {
  if (!win || typeof win.ReactNativeWebView?.postMessage !== 'function') return null;
  return parseNativeAppInfo(win[APP_MARKER_KEY]);
}

/** 사용자가 시스템 브라우저나 공유 시트에 머무는 시간이 길어 요청마다 기다리는 시간이 다르다. */
const DEFAULT_TIMEOUT_MS: Record<TWebRequestType, number> = {
  'notifications.registration': 2 * 60_000,
  'notifications.badge': 10_000,
  'notifications.settings': 10_000,
  'share.open': 5 * 60_000,
  'clipboard.copy': 10_000,
  'haptics.impact': 5_000,
  'link.open': 10_000,
  'auth.socialLogin': 10 * 60_000,
};

interface IPendingRequest {
  type: TWebRequestType;
  resolve: (value: unknown) => void;
  reject: (error: BridgeError) => void;
  timer: ReturnType<typeof setTimeout>;
}

type TNativeRequestHandler<T extends TNativeRequestType> = (
  payload: TNativeRequestPayload<T>,
) => TNativeRequestResult<T> | Promise<TNativeRequestResult<T>>;

export interface IWebBridge {
  readonly app: TNativeAppInfo | null;
  /** 앱이 해당 요청을 처리할 수 있는지. 앱 버전이 낮으면 false라 웹 기능으로 대신한다. */
  supports: (type: TWebRequestType) => boolean;
  request: <T extends TWebRequestType>(
    type: T,
    payload: TWebRequestPayload<T>,
    options?: { timeoutMs?: number },
  ) => Promise<TWebRequestResult<T>>;
  notify: <T extends TWebEventType>(type: T, payload: TWebEventPayload<T>) => void;
  onEvent: <T extends TNativeEventType>(
    type: T,
    listener: (payload: TNativeEventPayload<T>) => void,
  ) => () => void;
  handleRequest: <T extends TNativeRequestType>(type: T, handler: TNativeRequestHandler<T>) => () => void;
  dispose: () => void;
}

/**
 * 웹 쪽 브리지. 앱 밖에서도 만들 수 있고, 그때 request는 UNSUPPORTED로 거절되며 notify는 아무것도 하지 않는다.
 * 앱 → 웹 메시지는 앱이 window에 CustomEvent(NATIVE_EVENT_NAME, detail: JSON 문자열)로 보낸다.
 */
export function createWebBridge(win: TBridgeWindow | undefined): IWebBridge {
  const app = readNativeAppInfo(win);
  const pending = new Map<string, IPendingRequest>();
  const eventListeners = new Map<TNativeEventType, Set<(payload: never) => void>>();
  const requestHandlers = new Map<TNativeRequestType, (payload: never) => unknown>();

  function post(message: TWebMessage) {
    win?.ReactNativeWebView?.postMessage(encodeMessage(message));
  }

  async function answer(id: string, type: TNativeRequestType, payload: unknown) {
    const handler = requestHandlers.get(type);
    if (!handler) {
      post(errorResponse(id, BRIDGE_ERROR_CODE.Unsupported, `${type} 요청을 처리할 수 없습니다.`));
      return;
    }
    try {
      const result = NATIVE_REQUEST[type].result.parse(await handler(payload as never));
      post(successResponse(id, result));
    } catch (error) {
      post(
        errorResponse(
          id,
          BRIDGE_ERROR_CODE.Failed,
          error instanceof Error ? error.message : '처리하지 못했습니다.',
        ),
      );
    }
  }

  function handleNativeEvent(event: Event) {
    const message = decodeNativeMessage((event as CustomEvent<unknown>).detail);
    if (!message) return;
    if (message.kind === 'response') {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (!message.ok) {
        request.reject(new BridgeError(message.error.code, message.error.message));
        return;
      }
      const result = WEB_REQUEST[request.type].result.safeParse(message.result);
      if (result.success) {
        request.resolve(result.data);
        return;
      }
      request.reject(new BridgeError(BRIDGE_ERROR_CODE.Invalid, '앱 응답 형식이 올바르지 않습니다.'));
      return;
    }
    if (message.kind === 'event') {
      const payload = NATIVE_EVENT[message.type].parse(message.payload);
      eventListeners.get(message.type)?.forEach((listener) => listener(payload as never));
      return;
    }
    void answer(message.id, message.type, message.payload);
  }

  win?.addEventListener(NATIVE_EVENT_NAME, handleNativeEvent);

  return {
    app,
    supports: (type) => Boolean(app?.capabilities.includes(type)),
    request: (type, payload, options) => {
      if (!app?.capabilities.includes(type))
        return Promise.reject(
          new BridgeError(BRIDGE_ERROR_CODE.Unsupported, '앱에서 지원하지 않는 기능입니다.'),
        );
      const parsed = WEB_REQUEST[type].payload.safeParse(payload);
      if (!parsed.success)
        return Promise.reject(new BridgeError(BRIDGE_ERROR_CODE.Invalid, '요청 형식이 올바르지 않습니다.'));
      const id = createMessageId();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new BridgeError(BRIDGE_ERROR_CODE.Timeout, '앱이 응답하지 않습니다.'));
        }, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS[type]);
        pending.set(id, { type, resolve: resolve as (value: unknown) => void, reject, timer });
        post({ v: PROTOCOL_VERSION, kind: 'request', id, type, payload: parsed.data } as TWebMessage);
      });
    },
    notify: (type, payload) => {
      if (!app) return;
      const parsed = WEB_EVENT[type].safeParse(payload);
      if (parsed.success)
        post({ v: PROTOCOL_VERSION, kind: 'event', type, payload: parsed.data } as TWebMessage);
    },
    onEvent: (type, listener) => {
      const listeners = eventListeners.get(type) ?? new Set();
      listeners.add(listener as (payload: never) => void);
      eventListeners.set(type, listeners);
      return () => listeners.delete(listener as (payload: never) => void);
    },
    handleRequest: (type, handler) => {
      requestHandlers.set(type, handler as (payload: never) => unknown);
      return () => {
        if (requestHandlers.get(type) === handler) requestHandlers.delete(type);
      };
    },
    dispose: () => {
      win?.removeEventListener(NATIVE_EVENT_NAME, handleNativeEvent);
      pending.forEach((request) => {
        clearTimeout(request.timer);
        request.reject(new BridgeError(BRIDGE_ERROR_CODE.Cancelled, '브리지가 닫혔습니다.'));
      });
      pending.clear();
      eventListeners.clear();
      requestHandlers.clear();
    },
  };
}
