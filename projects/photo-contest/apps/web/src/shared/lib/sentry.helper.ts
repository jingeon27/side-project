import type { Event, init } from '@sentry/nextjs';

import type { TNativeAppInfo } from '@photo-contest/bridge';

import { toPathTemplate } from '../model/analytics/path-template.helper';

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

/** 오류를 앱 WebView와 브라우저로 나눠 보려는 태그. 앱 버전은 앱 안일 때만 붙인다. */
export function buildSentryClientTags(app: Pick<TNativeAppInfo, 'appVersion'> | null) {
  return app ? { client: 'app', app_version: app.appVersion } : { client: 'web' };
}

/** `/invite/abc`·`GET /invite/[token]`·`https://…/groups/x` → 경로 부분만 path_template(`/invite/:token`)로 바꾼다. */
export function toSentryTransaction(transaction: string) {
  const parts = transaction.match(/^((?:[A-Z]+ )?)(?:https?:\/\/[^/?#\s]+)?(\/\S*)$/);
  if (!parts) return transaction;
  return `${parts[1] ?? ''}${toPathTemplate(parts[2] ?? '/')}`;
}

/**
 * 보내기 전에 사람을 알아볼 수 있는 값을 지운다. 요청(URL에 초대 토큰, 쿠키·헤더), 사용자, 브레드크럼(입력·이동 기록)을 빼고
 * 트랜잭션 이름(브라우저는 실제 경로를 쓴다)을 path_template로 바꾼다.
 * Sentry는 sendDefaultPii false여도 요청 URL·헤더를 붙이므로 여기서 한 번 더 막는다. 오류·트랜잭션 이벤트 모두에 쓴다.
 */
export function scrubSentryEvent<TEvent extends Event>(event: TEvent): TEvent {
  delete event.request;
  delete event.user;
  delete event.breadcrumbs;
  if (event.transaction) event.transaction = toSentryTransaction(event.transaction);
  if (event.contexts) {
    // 서버 SDK가 붙이는 요청·쿠키 문맥
    delete event.contexts.request;
    delete event.contexts.cookies;
  }
  return event;
}
