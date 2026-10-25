import type { ErrorEvent, init } from '@sentry/nextjs';

type TEnv = Record<string, string | undefined>;
type TDataCollection = NonNullable<Parameters<typeof init>[0]['dataCollection']>;

/**
 * Sentry 11에서 sendDefaultPii를 대신하는 설정. 사용자·쿠키·헤더·쿼리·본문·GraphQL 변수를 모으지 않는다
 * (초대 토큰·세션 쿠키·닉네임이 섞일 수 있다).
 */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
} satisfies TDataCollection;

/** 브라우저는 빌드에 들어가는 NEXT_PUBLIC_SENTRY_DSN만 읽는다. 비어 있으면 Sentry를 켜지 않는다. */
export function resolveClientSentryDsn(env: TEnv) {
  return env.NEXT_PUBLIC_SENTRY_DSN?.trim() || null;
}

/** 서버는 SENTRY_DSN을 먼저, 없으면 브라우저와 같은 DSN을 쓴다. */
export function resolveServerSentryDsn(env: TEnv) {
  return env.SENTRY_DSN?.trim() || resolveClientSentryDsn(env);
}

export function resolveSentryRelease(env: TEnv) {
  return env.SENTRY_RELEASE?.trim() || env.NEXT_PUBLIC_SENTRY_RELEASE?.trim() || undefined;
}

/** 오류를 앱 WebView와 브라우저로 나눠 보려는 태그. 앱 버전은 앱 안일 때만 붙인다. */
export function buildSentryClientTags(app: boolean) {
  return { client: app ? 'webview' : 'browser' };
}

/**
 * 보내기 전에 사람을 알아볼 수 있는 값을 지운다. 요청(URL에 초대 토큰, 쿠키·헤더), 사용자, 브레드크럼(입력·이동 기록)을 뺀다.
 * Sentry는 sendDefaultPii false여도 요청 URL·헤더를 붙이므로 여기서 한 번 더 막는다.
 */
export function scrubSentryEvent<TEvent extends ErrorEvent>(event: TEvent): TEvent {
  delete event.request;
  delete event.user;
  delete event.breadcrumbs;
  delete event.contexts;
  delete event.extra;
  delete event.message;
  if (event.transaction) event.transaction = event.transaction.split(/[?#]/)[0];
  for (const exception of event.exception?.values ?? []) {
    const react = exception.value?.match(/Minified React error #(\d+)/);
    exception.value = react ? `React error #${react[1]}` : `Unexpected ${exception.type ?? 'Error'}`;
    for (const frame of exception.stacktrace?.frames ?? []) {
      if (frame.filename) frame.filename = frame.filename.split(/[?#]/)[0];
      if (frame.abs_path) frame.abs_path = frame.abs_path.split(/[?#]/)[0];
      delete frame.vars;
      delete frame.pre_context;
      delete frame.post_context;
      delete frame.context_line;
    }
  }
  return event;
}

export function filterSentryEvent<TEvent extends ErrorEvent>(event: TEvent, error: unknown) {
  if (error instanceof Error && ['AbortError', 'CanceledError'].includes(error.name)) return null;
  return scrubSentryEvent(event);
}
