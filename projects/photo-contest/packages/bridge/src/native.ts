import {
  APP_MARKER_KEY,
  BRIDGE_ERROR_CODE,
  NATIVE_EVENT,
  NATIVE_EVENT_NAME,
  NATIVE_REQUEST,
  PROTOCOL_VERSION,
  WEB_EVENT,
  WEB_REQUEST,
  createMessageId,
  decodeWebMessage,
  errorResponse,
  originOf,
  readRequestId,
  successResponse,
} from './protocol';
import type {
  TBridgeErrorCode,
  TNativeAppInfo,
  TNativeEventPayload,
  TNativeEventType,
  TNativeMessage,
  TNativeRequestPayload,
  TNativeRequestResult,
  TNativeRequestType,
  TWebEventPayload,
  TWebEventType,
  TWebRequestPayload,
  TWebRequestResult,
  TWebRequestType,
} from './protocol';

/** 앱이 구현하는 기능. 없는 기능은 웹에 UNSUPPORTED로 답한다. */
export type TNativeCapabilities = {
  [T in TWebRequestType]?: (payload: TWebRequestPayload<T>) => Promise<TWebRequestResult<T>>;
};

/** 기능 구현이 던지면 이 코드로 웹에 전달한다. 그 밖의 오류는 FAILED. */
export class NativeCapabilityError extends Error {
  readonly code: TBridgeErrorCode;

  constructor(code: TBridgeErrorCode, message: string) {
    super(message);
    this.name = 'NativeCapabilityError';
    this.code = code;
  }
}

type TWebEventListeners = {
  [T in TWebEventType]?: (payload: TWebEventPayload<T>) => void;
};

interface INativeRouterOptions {
  /** 이 origin에서 온 메시지만 처리한다 (예: https://contest.example). */
  allowedOrigin: string;
  capabilities: TNativeCapabilities;
  /** 웹으로 메시지를 보낸다. 앱에서는 injectJavaScript(buildNativeDispatchScript(message)). */
  send: (message: TNativeMessage) => void;
  onEvent?: TWebEventListeners;
}

export interface INativeRouter {
  /** WebView onMessage의 data와 메시지를 보낸 문서 URL */
  handleMessage: (raw: string, sourceUrl: string) => Promise<void>;
  requestWeb: <T extends TNativeRequestType>(
    type: T,
    payload: TNativeRequestPayload<T>,
    options?: { timeoutMs?: number },
  ) => Promise<TNativeRequestResult<T>>;
  emit: <T extends TNativeEventType>(type: T, payload: TNativeEventPayload<T>) => void;
  dispose: () => void;
}

export function createNativeRouter({
  allowedOrigin,
  capabilities,
  send,
  onEvent,
}: INativeRouterOptions): INativeRouter {
  const expectedOrigin = originOf(allowedOrigin);
  const pending = new Map<
    string,
    {
      type: TNativeRequestType;
      resolve: (value: unknown) => void;
      reject: (error: NativeCapabilityError) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  async function runCapability(id: string, type: TWebRequestType, payload: unknown) {
    const capability = capabilities[type] as ((input: unknown) => Promise<unknown>) | undefined;
    if (!capability) {
      send(errorResponse(id, BRIDGE_ERROR_CODE.Unsupported, '앱에서 지원하지 않는 기능입니다.'));
      return;
    }
    try {
      const result = WEB_REQUEST[type].result.safeParse(await capability(payload));
      send(
        result.success
          ? successResponse(id, result.data)
          : errorResponse(id, BRIDGE_ERROR_CODE.Failed, '앱 응답을 만들지 못했습니다.'),
      );
    } catch (error) {
      if (error instanceof NativeCapabilityError) send(errorResponse(id, error.code, error.message));
      else send(errorResponse(id, BRIDGE_ERROR_CODE.Failed, '요청을 처리하지 못했습니다.'));
    }
  }

  return {
    handleMessage: async (raw, sourceUrl) => {
      if (!expectedOrigin || originOf(sourceUrl) !== expectedOrigin) return;
      const message = decodeWebMessage(raw);
      if (!message) {
        const id = readRequestId(raw);
        if (id) send(errorResponse(id, BRIDGE_ERROR_CODE.Invalid, '요청 형식이 올바르지 않습니다.'));
        return;
      }
      if (message.kind === 'request') {
        await runCapability(message.id, message.type, message.payload);
        return;
      }
      if (message.kind === 'event') {
        const listener = onEvent?.[message.type] as ((payload: unknown) => void) | undefined;
        listener?.(WEB_EVENT[message.type].parse(message.payload));
        return;
      }
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (!message.ok) {
        request.reject(new NativeCapabilityError(message.error.code, message.error.message));
        return;
      }
      const result = NATIVE_REQUEST[request.type].result.safeParse(message.result);
      if (result.success) request.resolve(result.data);
      else
        request.reject(
          new NativeCapabilityError(BRIDGE_ERROR_CODE.Invalid, '웹 응답 형식이 올바르지 않습니다.'),
        );
    },
    requestWeb: (type, payload, options) => {
      const id = createMessageId();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new NativeCapabilityError(BRIDGE_ERROR_CODE.Timeout, '웹이 응답하지 않습니다.'));
        }, options?.timeoutMs ?? 1_500);
        pending.set(id, { type, resolve: resolve as (value: unknown) => void, reject, timer });
        send({
          v: PROTOCOL_VERSION,
          kind: 'request',
          id,
          type,
          payload: NATIVE_REQUEST[type].payload.parse(payload),
        });
      });
    },
    emit: (type, payload) => {
      send({
        v: PROTOCOL_VERSION,
        kind: 'event',
        type,
        payload: NATIVE_EVENT[type].parse(payload),
      } as TNativeMessage);
    },
    dispose: () => {
      pending.forEach((request) => {
        clearTimeout(request.timer);
        request.reject(new NativeCapabilityError(BRIDGE_ERROR_CODE.Cancelled, '브리지가 닫혔습니다.'));
      });
      pending.clear();
    },
  };
}

/** U+2028/2029와 `<`를 이스케이프해 어떤 문자열도 스크립트 리터럴로 안전하게 넣는다. */
function toScriptLiteral(value: string) {
  return JSON.stringify(value).replace(
    /[\u2028\u2029<]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/** injectedJavaScriptBeforeContentLoaded. 문서 스크립트보다 먼저 앱 정보를 심는다. */
export function buildBootstrapScript(info: TNativeAppInfo) {
  return `window[${toScriptLiteral(APP_MARKER_KEY)}]=Object.freeze(JSON.parse(${toScriptLiteral(JSON.stringify(info))}));true;`;
}

/** injectJavaScript로 웹에 메시지를 보낸다. detail은 웹이 다시 검증하는 JSON 문자열이다. */
export function buildNativeDispatchScript(message: TNativeMessage) {
  return `window.dispatchEvent(new CustomEvent(${toScriptLiteral(NATIVE_EVENT_NAME)},{detail:${toScriptLiteral(JSON.stringify(message))}}));true;`;
}
