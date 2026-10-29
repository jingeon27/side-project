import { captureException, init, type Event, type NodeOptions } from '@sentry/node';

import { performancePrivacyIntegration, scrubPerformanceSpan } from './performance';

const sentryDsn = () => process.env.SENTRY_DSN?.trim();
const sentryEnvironment = () => process.env.ENVIRONMENT || 'development';
const sentryRelease = () => process.env.SENTRY_RELEASE;
const sentryTracesSampleRate = () => 0.1;

const STACK_FRAME = /^\s+at /;

/** Sentry 태그. 라우트 패턴·operationName처럼 개인정보가 아닌 값만 넣는다. */
export type TErrorTags = Record<string, string>;

// Apollo(graphql CJS)가 만든 GraphQLError는 테스트에서 다른 graphql 사본일 수 있어 instanceof 대신 속성으로 본다.
function wrappedError(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('originalError' in error)) return undefined;
  return error.originalError instanceof Error ? error.originalError : undefined;
}

function stringProperty(value: unknown, name: string) {
  if (typeof value !== 'object' || value === null || !(name in value)) return undefined;
  const property: unknown = Reflect.get(value, name);
  return typeof property === 'string' ? property : undefined;
}

/** Prisma처럼 오류에 붙은 code, 없으면 GraphQL extensions.code */
function errorCode(error: unknown) {
  if (typeof error !== 'object' || error === null) return undefined;
  const extensions: unknown = 'extensions' in error ? error.extensions : undefined;
  return stringProperty(error, 'code') ?? stringProperty(extensions, 'code');
}

/**
 * 원본 메시지에는 Prisma 쿼리 인자(닉네임·설명 등)가 섞일 수 있으므로
 * 오류 종류·코드와 호출 위치(stack frame)만 남긴 오류를 만든다.
 */
export function reportableError(error: unknown): Error {
  const original = wrappedError(error) ?? error;
  const kind = original instanceof Error ? original.name : typeof original;
  const code = errorCode(original);
  const reportable = new Error(`Unexpected ${kind}${code ? ` ${code}` : ''}`);
  if (original instanceof Error && original.stack) {
    const frames = original.stack.split('\n').filter((line) => STACK_FRAME.test(line));
    reportable.stack = [`Error: ${reportable.message}`, ...frames].join('\n');
  }
  return reportable;
}

/** 요청(본문·쿠키·헤더)·사용자·breadcrumb는 어떤 보고에도 싣지 않는다. */
export function scrubEvent<TEvent extends Event>(event: TEvent): TEvent {
  delete event.request;
  delete event.user;
  delete event.breadcrumbs;
  return event;
}

/** SENTRY_DSN이 없으면 undefined — 초기화하지 않고 아무것도 보내지 않는다. */
export function sentryOptions(): NodeOptions | undefined {
  const dsn = sentryDsn();
  if (!dsn) return undefined;
  return {
    dsn,
    initialScope: { tags: { service: 'game-feedback', layer: 'api' } },
    environment: sentryEnvironment(),
    release: sentryRelease(),
    tracesSampleRate: sentryTracesSampleRate(),
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
    },
    // Only explicit HTTP/chat spans are collected; automatic URL/header/SQL instrumentation stays off.
    defaultIntegrations: false,
    integrations: [performancePrivacyIntegration],
    enableRuntimeChannelInjection: false,
    beforeSend: scrubEvent,
    beforeSendSpan: scrubPerformanceSpan,
  };
}

/** @returns Sentry를 켰는지 */
export function initSentry(): boolean {
  const options = sentryOptions();
  if (!options) return false;
  init(options);
  return true;
}

/** 예상하지 못한 오류(GraphQL 내부 오류·REST 5xx·주기 작업 실패)만 보낸다. 4xx 업무 오류는 부르지 않는다. */
export function reportUnexpectedError(error: unknown, tags: TErrorTags) {
  if (!sentryDsn()) return;
  captureException(reportableError(error), { tags });
}
