import { z } from 'zod';

/** 웹과 앱이 서로 다른 버전으로 배포돼도 메시지 해석이 어긋나지 않게 봉투에 싣는다. */
export const PROTOCOL_VERSION = 1;
/** 앱 → 웹 메시지를 싣는 window 이벤트 이름. detail은 JSON 문자열이다. */
export const NATIVE_EVENT_NAME = 'photo-contest:native';
/** 앱이 문서 로드 전에 심는 앱 정보의 window 키 */
export const APP_MARKER_KEY = '__PHOTO_CONTEST_APP__';
/** WebView User-Agent 뒤에 붙는 토큰. 서버 렌더링에서 화면 모양을 고를 때만 쓰고 권한 판단에는 쓰지 않는다. */
export const APP_USER_AGENT_PREFIX = 'PhotoContestApp';

export const BRIDGE_ERROR_CODE = {
  Unsupported: 'UNSUPPORTED',
  Cancelled: 'CANCELLED',
  Failed: 'FAILED',
  Invalid: 'INVALID',
  Timeout: 'TIMEOUT',
} as const;
export type TBridgeErrorCode = (typeof BRIDGE_ERROR_CODE)[keyof typeof BRIDGE_ERROR_CODE];

/** URL 생성자가 불완전한 런타임(구형 WKWebView, React Native)에서도 같은 결과를 내도록 정규식으로 검사한다. */
const HTTP_URL = /^https?:\/\/[^\s/?#@]+(?:[/?#][^\s]*)?$/i;
const httpUrl = z.string().max(2048).regex(HTTP_URL, 'http(s) URL만 허용합니다.');
// S3 임시 자격 증명과 한글 파일명이 포함된 서명 URL은 일반 공유 링크보다 길다.
const downloadCapableUrl = z.string().max(8192).regex(HTTP_URL, 'http(s) URL만 허용합니다.');

/** `https://a.example:3000/path` → `https://a.example:3000`. 형식이 다르면 null. */
export function originOf(url: string): string | null {
  const match = url.match(/^(https?:\/\/[^\s/?#@]+)(?:[/?#]|$)/i);
  return match?.[1] ? match[1].toLowerCase() : null;
}
const messageId = z.string().min(1).max(64);
const pathValue = z.string().min(1).max(2048);

export const PushRegistrationSchema = z
  .object({
    installationId: z.uuidv4(),
    platform: z.enum(['ios', 'android']),
    status: z.enum(['granted', 'denied', 'undetermined', 'unavailable']),
    token: z
      .string()
      .regex(/^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{16,200}\]$/)
      .nullable(),
  })
  .strict()
  .refine((value) => (value.status === 'granted') === (value.token !== null));
export type TPushRegistration = z.infer<typeof PushRegistrationSchema>;

/** 웹이 앱에 요청하고 결과를 기다리는 기능 */
export const WEB_REQUEST = {
  'notifications.registration': {
    payload: z.object({ requestPermission: z.boolean() }),
    result: PushRegistrationSchema,
  },
  'notifications.badge': {
    payload: z.object({ count: z.int().min(0).max(9999) }),
    result: z.object({ updated: z.boolean() }),
  },
  'notifications.settings': { payload: z.object({}), result: z.object({ opened: z.boolean() }) },
  'share.open': {
    payload: z.object({
      url: httpUrl,
      title: z.string().max(100).optional(),
      text: z.string().max(500).optional(),
    }),
    result: z.object({ shared: z.boolean() }),
  },
  'clipboard.copy': {
    payload: z.object({ text: z.string().min(1).max(2000) }),
    result: z.object({ copied: z.literal(true) }),
  },
  'haptics.impact': {
    payload: z.object({ style: z.enum(['light', 'medium', 'heavy', 'success', 'warning', 'error']) }),
    result: z.object({}),
  },
  'link.open': {
    payload: z.object({ url: downloadCapableUrl }),
    result: z.object({ opened: z.boolean() }),
  },
  /** 시스템 브라우저로 소셜 로그인한 뒤 앱 로그인 교환에 쓸 일회용 코드와 verifier를 돌려준다. */
  'auth.socialLogin': {
    payload: z.object({ provider: z.enum(['google', 'kakao']) }),
    result: z.object({
      code: z.string().min(16).max(256),
      verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
    }),
  },
} as const;
export type TWebRequestType = keyof typeof WEB_REQUEST;
export type TWebRequestPayload<T extends TWebRequestType> = z.input<(typeof WEB_REQUEST)[T]['payload']>;
export type TWebRequestResult<T extends TWebRequestType> = z.output<(typeof WEB_REQUEST)[T]['result']>;

/** 앱이 웹에 요청하고 결과를 기다리는 기능 */
export const NATIVE_REQUEST = {
  /** Android 뒤로 가기. 웹이 처리하지 않으면 앱이 OS 기본 동작을 한다. */
  'navigation.back': {
    payload: z.object({}),
    result: z.object({ handled: z.boolean() }),
  },
} as const;
export type TNativeRequestType = keyof typeof NATIVE_REQUEST;
export type TNativeRequestPayload<T extends TNativeRequestType> = z.input<
  (typeof NATIVE_REQUEST)[T]['payload']
>;
export type TNativeRequestResult<T extends TNativeRequestType> = z.output<
  (typeof NATIVE_REQUEST)[T]['result']
>;

/** 웹 → 앱 알림 (응답 없음) */
export const WEB_EVENT = {
  'app.ready': z.object({ path: pathValue }),
  'navigation.changed': z.object({ path: pathValue }),
  /** userId는 네이티브 분석 도구의 사용자 식별에만 쓴다(세션 토큰이 아니다). */
  'auth.changed': z.object({ signedIn: z.boolean(), userId: z.string().min(1).max(64).optional() }),
  'appearance.changed': z.object({ preference: z.enum(['system', 'light', 'dark']) }),
} as const;
export type TWebEventType = keyof typeof WEB_EVENT;
export type TWebEventPayload<T extends TWebEventType> = z.input<(typeof WEB_EVENT)[T]>;

/** `/groups/1?x=1` 같은 같은 origin 상대 경로만. `//evil.example`이나 `/\\evil`처럼 다른 origin으로 새는 값은 거부한다. */
const RELATIVE_PATH = /^\/(?![/\\])[^\s]*$/;

/** 앱 → 웹 알림 (응답 없음) */
export const NATIVE_EVENT = {
  'notifications.received': z.object({}),
  'app.state': z.object({ state: z.enum(['active', 'background']) }),
  /** 딥링크·알림을 눌러 앱이 열렸을 때 웹이 그 경로로 이동한다. */
  'navigation.open': z.object({ path: z.string().max(2048).regex(RELATIVE_PATH) }),
} as const;
export type TNativeEventType = keyof typeof NATIVE_EVENT;
export type TNativeEventPayload<T extends TNativeEventType> = z.input<(typeof NATIVE_EVENT)[T]>;

const errorSchema = z.object({
  code: z.enum(['UNSUPPORTED', 'CANCELLED', 'FAILED', 'INVALID', 'TIMEOUT']),
  message: z.string().max(500),
});
const responseSchema = z.discriminatedUnion('ok', [
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    kind: z.literal('response'),
    id: messageId,
    ok: z.literal(true),
    result: z.unknown(),
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    kind: z.literal('response'),
    id: messageId,
    ok: z.literal(false),
    error: errorSchema,
  }),
]);
export type TBridgeResponse = z.output<typeof responseSchema>;

const webRequestSchema = z.discriminatedUnion('type', [
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    kind: z.literal('request'),
    id: messageId,
    type: z.literal('notifications.registration'),
    payload: WEB_REQUEST['notifications.registration'].payload,
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    kind: z.literal('request'),
    id: messageId,
    type: z.literal('notifications.badge'),
    payload: WEB_REQUEST['notifications.badge'].payload,
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    kind: z.literal('request'),
    id: messageId,
    type: z.literal('notifications.settings'),
    payload: WEB_REQUEST['notifications.settings'].payload,
  }),

  z.object({
    v: z.literal(PROTOCOL_VERSION),
    kind: z.literal('request'),
    id: messageId,
    type: z.literal('share.open'),
    payload: WEB_REQUEST['share.open'].payload,
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    kind: z.literal('request'),
    id: messageId,
    type: z.literal('clipboard.copy'),
    payload: WEB_REQUEST['clipboard.copy'].payload,
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    kind: z.literal('request'),
    id: messageId,
    type: z.literal('haptics.impact'),
    payload: WEB_REQUEST['haptics.impact'].payload,
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    kind: z.literal('request'),
    id: messageId,
    type: z.literal('link.open'),
    payload: WEB_REQUEST['link.open'].payload,
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    kind: z.literal('request'),
    id: messageId,
    type: z.literal('auth.socialLogin'),
    payload: WEB_REQUEST['auth.socialLogin'].payload,
  }),
]);
export type TWebRequestMessage = z.output<typeof webRequestSchema>;

const webEventSchema = z.discriminatedUnion('type', [
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    kind: z.literal('event'),
    type: z.literal('appearance.changed'),
    payload: WEB_EVENT['appearance.changed'],
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    kind: z.literal('event'),
    type: z.literal('app.ready'),
    payload: WEB_EVENT['app.ready'],
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    kind: z.literal('event'),
    type: z.literal('navigation.changed'),
    payload: WEB_EVENT['navigation.changed'],
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    kind: z.literal('event'),
    type: z.literal('auth.changed'),
    payload: WEB_EVENT['auth.changed'],
  }),
]);
export type TWebEventMessage = z.output<typeof webEventSchema>;

const nativeRequestSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  kind: z.literal('request'),
  id: messageId,
  type: z.literal('navigation.back'),
  payload: NATIVE_REQUEST['navigation.back'].payload,
});
export type TNativeRequestMessage = z.output<typeof nativeRequestSchema>;

const nativeEventSchema = z.discriminatedUnion('type', [
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    kind: z.literal('event'),
    type: z.literal('notifications.received'),
    payload: NATIVE_EVENT['notifications.received'],
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    kind: z.literal('event'),
    type: z.literal('app.state'),
    payload: NATIVE_EVENT['app.state'],
  }),
  z.object({
    v: z.literal(PROTOCOL_VERSION),
    kind: z.literal('event'),
    type: z.literal('navigation.open'),
    payload: NATIVE_EVENT['navigation.open'],
  }),
]);
export type TNativeEventMessage = z.output<typeof nativeEventSchema>;

/** 웹이 앱으로 보내는 메시지 */
export type TWebMessage = TWebRequestMessage | TWebEventMessage | TBridgeResponse;
/** 앱이 웹으로 보내는 메시지 */
export type TNativeMessage = TNativeRequestMessage | TNativeEventMessage | TBridgeResponse;

const kindSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  kind: z.enum(['request', 'event', 'response']),
});

function parseJson(raw: unknown): unknown {
  if (typeof raw !== 'string' || raw.length > 20_000) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** 앱이 받은 문자열을 검증한다. 형식이 틀리거나 모르는 종류면 null. */
export function decodeWebMessage(raw: unknown): TWebMessage | null {
  const value = parseJson(raw);
  const kind = kindSchema.safeParse(value);
  if (!kind.success) return null;
  const schema =
    kind.data.kind === 'request'
      ? webRequestSchema
      : kind.data.kind === 'event'
        ? webEventSchema
        : responseSchema;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** 웹이 받은 문자열을 검증한다. 형식이 틀리거나 모르는 종류면 null. */
export function decodeNativeMessage(raw: unknown): TNativeMessage | null {
  const value = parseJson(raw);
  const kind = kindSchema.safeParse(value);
  if (!kind.success) return null;
  const schema =
    kind.data.kind === 'request'
      ? nativeRequestSchema
      : kind.data.kind === 'event'
        ? nativeEventSchema
        : responseSchema;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** 요청 봉투에서 id만 꺼낸다. 본문이 틀린 요청에도 INVALID로 답하기 위해 쓴다. */
export function readRequestId(raw: unknown): string | null {
  const parsed = z
    .object({ v: z.literal(PROTOCOL_VERSION), kind: z.literal('request'), id: messageId })
    .safeParse(parseJson(raw));
  return parsed.success ? parsed.data.id : null;
}

export function encodeMessage(message: TWebMessage | TNativeMessage) {
  return JSON.stringify(message);
}

export function successResponse(id: string, result: unknown): TBridgeResponse {
  return { v: PROTOCOL_VERSION, kind: 'response', id, ok: true, result };
}

export function errorResponse(id: string, code: TBridgeErrorCode, message: string): TBridgeResponse {
  return {
    v: PROTOCOL_VERSION,
    kind: 'response',
    id,
    ok: false,
    error: { code, message: message.slice(0, 500) },
  };
}

const appInfoSchema = z.object({
  platform: z.enum(['ios', 'android', 'web']),
  appVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  protocolVersion: z.number().int().positive(),
  capabilities: z.array(z.string()).max(32),
  /** 웹 분석 SDK가 네이티브와 같은 기기 ID를 쓰도록 앱이 넘긴다. 없으면 웹이 자기 ID를 쓴다. */
  analyticsDeviceId: z.string().min(1).max(128).optional(),
});
export type TNativeAppInfo = z.output<typeof appInfoSchema>;

export function parseNativeAppInfo(value: unknown): TNativeAppInfo | null {
  const parsed = appInfoSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** 서버 렌더링에서 앱 WebView인지 고를 때 쓴다. 화면 모양에만 쓰고 권한 판단에는 쓰지 않는다. */
export function parseAppUserAgent(userAgent: string | null | undefined): { appVersion: string } | null {
  const match = userAgent?.match(new RegExp(`${APP_USER_AGENT_PREFIX}/(\\d+\\.\\d+\\.\\d+)`));
  return match?.[1] ? { appVersion: match[1] } : null;
}

export function buildAppUserAgent(appVersion: string) {
  return `${APP_USER_AGENT_PREFIX}/${appVersion}`;
}

let sequence = 0;
/** http로 연 WebView는 보안 컨텍스트가 아니라 crypto.randomUUID가 없을 수 있다. 응답 짝 맞추기용이라 예측 가능해도 된다. */
export function createMessageId() {
  sequence = (sequence + 1) % Number.MAX_SAFE_INTEGER;
  return `${Date.now().toString(36)}-${sequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
