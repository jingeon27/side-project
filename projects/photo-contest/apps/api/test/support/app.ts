import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import type { Express } from 'express';
import request from 'supertest';
import { inject } from 'vitest';

import { createDatabaseClient } from '@photo-contest/test-kit';

import { sessionCookieName } from '../../src/auth/auth-cookie';
import { createApp } from '../../src/bootstrap';
import { randomToken, sha256Hex } from '../../src/common/crypto';
import { SESSION_TTL_MS } from '../../src/config/limits';
import { SchedulerService } from '../../src/maintenance/scheduler.service';
import { MediaStorage } from '../../src/storage/media-storage.service';

/** 테스트 요청이 보내는 Origin. API는 listen하지 않으므로 실제 웹 서버와 겹치지 않는다. */
export const TEST_WEB_ORIGIN = 'http://web.test';
/** 한 테스트가 한꺼번에 보내는 요청 수의 상한 */
const CONCURRENT_REQUESTS_MAX = 32;

// 개발자 .env의 실제 키(OAuth·Sentry·S3·AWS)가 테스트 요청으로 새지 않도록 앱을 만들기 전에 지운다.
const CLEARED_ENV = [
  'PUSH_NOTIFICATIONS_ENABLED',
  'EXPO_ACCESS_TOKEN',
  'SENTRY_DSN',
  'S3_BUCKET',
  'S3_KEY_PREFIX',
  'S3_REGION',
  'S3_ENDPOINT',
  'S3_FORCE_PATH_STYLE',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
] as const;

export type TTestDatabase = ReturnType<typeof createDatabaseClient>;

export interface IGraphqlError {
  message: string;
  extensions?: { code?: string };
}

export interface IGraphqlResult<TData> {
  data?: TData | null;
  errors?: IGraphqlError[];
}

export interface IGraphqlFailure {
  code: string | undefined;
  message: string;
}

export interface IStorageForm {
  url: string;
  fields: ReadonlyArray<{ name: string; value: string }>;
}

export interface IRedirectResponse {
  status: number;
  headers: Record<string, string>;
}

export interface ITestUser {
  id: string;
  nickname: string;
  /** 요청 Cookie 헤더 값 (`contest_session=...`) */
  cookie: string;
}

export interface ITestApi {
  app: INestApplication;
  /** 격리 스키마를 직접 준비·확인하는 클라이언트. 앱과 다른 연결이다. */
  db: TTestDatabase;
  /** S3 대역을 가리키는 앱의 저장소. 테스트에서 HEAD·DELETE로 객체를 확인한다. */
  storage: MediaStorage;
  /** supertest 요청. 포트를 직접 열지 않고 Nest HTTP 서버에 보낸다. */
  http: () => ReturnType<typeof request>;
  /** 개발 로그인으로 세션 Cookie 헤더 값을 받는다. */
  login: (nickname: string) => Promise<string>;
  /** 개발 로그인 후 사용자 ID까지 확인한다. */
  signIn: (nickname: string) => Promise<ITestUser>;
  /** 브라우저처럼 Origin과 CSRF preflight 헤더를 붙여 GraphQL을 호출한다. cookie가 없으면 비로그인 */
  gql: <TData>(
    cookie: string | undefined,
    query: string,
    variables?: Record<string, unknown>,
  ) => Promise<IGraphqlResult<TData>>;
  /** 오류 없이 성공해야 하는 호출. 오류가 있으면 그 내용으로 실패한다. */
  gqlOk: <TData>(
    cookie: string | undefined,
    query: string,
    variables?: Record<string, unknown>,
  ) => Promise<TData>;
  /** 실패해야 하는 호출의 첫 오류 code·message */
  gqlFail: (
    cookie: string | undefined,
    query: string,
    variables?: Record<string, unknown>,
  ) => Promise<IGraphqlFailure>;
  /** 주기 작업(정리 → 종료 기록)을 한 번 돌린다. 하네스는 타이머를 멈춰 둔다. */
  runScheduledWork: () => Promise<void>;
  close: () => Promise<void>;
}

// 브라우저 역할의 저장소 전송은 API의 외부 요청을 대체하는 stubExternalFetch와 섞이지 않게 원래 fetch를 쓴다.
const browserFetch = globalThis.fetch;

/** 브라우저처럼 서명 POST 필드를 먼저, 파일을 마지막에 넣어 S3 대역에 직접 올린다(쿠키 없음). */
export function uploadToStorage(form: IStorageForm, body: Buffer | Uint8Array, contentType: string) {
  const multipart = new FormData();
  for (const field of form.fields) multipart.append(field.name, field.value);
  multipart.append('file', new Blob([new Uint8Array(body)], { type: contentType }), 'media');
  return browserFetch(form.url, { method: 'POST', body: multipart });
}

/** 앱이 바꾼 환경변수를 만들기 전 값으로 되돌리는 함수를 돌려준다. */
function applyEnv(values: Record<string, string>) {
  const names = [...new Set([...CLEARED_ENV, ...Object.keys(values)])];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of CLEARED_ENV) delete process.env[name];
  Object.assign(process.env, values);
  return function restoreEnv() {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      if (value !== undefined) process.env[name] = value;
    }
  };
}

/**
 * 고정 미디어 경로의 응답이 캐시 금지 307인지 확인하고 브라우저처럼 서명 GET을 따라간다.
 * 서명 주소는 1분 안에 만료되므로 테스트 안에서 바로 연다.
 */
export async function openStorageRedirect(response: IRedirectResponse, headers: Record<string, string> = {}) {
  if (response.status !== 307) throw new Error(`저장소로 보내는 307이어야 한다 (${response.status})`);
  if (response.headers['cache-control'] !== 'private, no-store')
    throw new Error(`서명 주소 이동은 캐시하면 안 된다 (${response.headers['cache-control']})`);
  const location = new URL(response.headers.location ?? '');
  if (location.searchParams.get('X-Amz-Expires') !== '60') throw new Error('서명 GET은 60초여야 한다');
  return browserFetch(location, { headers });
}

/**
 * 격리 스키마(globalSetup이 provide)를 보도록 환경변수를 맞춘 뒤 앱을 만든다. listen하지 않는다.
 * 설정은 요청마다 다시 읽히므로 테스트 안에서 바꾸는 값은 vi.stubEnv로 바꾼다(테스트가 끝나면 setup.ts가 되돌린다).
 * env로 넘긴 값은 close()가 되돌린다.
 */
export async function createTestApp(
  env: Record<string, string> = {},
  options: { testFixtures?: boolean; trustProxy?: number } = {},
): Promise<ITestApi> {
  const restoreEnv = applyEnv({
    ...inject('s3Env'),
    DATABASE_URL: inject('databaseUrl'),
    NODE_ENV: 'test',
    WEB_ORIGIN: TEST_WEB_ORIGIN,
    ...env,
  });
  const app = await createApp({
    logger: false,
    testFixtures: options.testFixtures ?? process.env.NODE_ENV === 'test',
  }).catch((error: unknown) => {
    restoreEnv();
    throw error;
  });
  app.get(SchedulerService).stop();
  if (options.trustProxy !== undefined) {
    const server: Express = app.getHttpAdapter().getInstance();
    server.set('trust proxy', options.trustProxy);
  }
  const db = createDatabaseClient(inject('databaseUrl'));

  const server: Server = app.getHttpServer();
  // supertest는 서버가 뜨기 전에 들어온 요청마다 'listening' 리스너를 하나씩 단다. 동시 요청 테스트가 기본 한도 10을 넘긴다.
  server.setMaxListeners(CONCURRENT_REQUESTS_MAX);
  const http = () => request(server);

  async function login(nickname: string) {
    const user = await db.user.upsert({
      where: { provider_providerId: { provider: 'testing', providerId: nickname } },
      create: { provider: 'testing', providerId: nickname, nickname },
      update: {},
    });
    const raw = randomToken();
    await db.session.create({
      data: { userId: user.id, tokenHash: sha256Hex(raw), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
    return `${sessionCookieName()}=${raw}`;
  }

  async function gql<TData>(
    cookie: string | undefined,
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<IGraphqlResult<TData>> {
    let pending = http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Apollo-Require-Preflight', 'true');
    if (cookie) pending = pending.set('Cookie', cookie);
    const response = await pending.send({ query, variables });
    return response.body as IGraphqlResult<TData>;
  }

  async function gqlOk<TData>(
    cookie: string | undefined,
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<TData> {
    const result = await gql<TData>(cookie, query, variables);
    if (result.errors?.length || !result.data)
      throw new Error(`GraphQL 호출이 실패했습니다: ${JSON.stringify(result.errors)}`);
    return result.data;
  }

  async function gqlFail(
    cookie: string | undefined,
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<IGraphqlFailure> {
    const result = await gql(cookie, query, variables);
    const [error] = result.errors ?? [];
    if (!error) throw new Error(`실패해야 하는 GraphQL 호출이 성공했습니다: ${JSON.stringify(result.data)}`);
    return { code: error.extensions?.code, message: error.message };
  }

  async function signIn(nickname: string): Promise<ITestUser> {
    const cookie = await login(nickname);
    const { me } = await gqlOk<{ me: { id: string } }>(cookie, '{ me { id } }');
    return { id: me.id, nickname, cookie };
  }

  return {
    app,
    db,
    storage: app.get(MediaStorage),
    http,
    login,
    signIn,
    gql,
    gqlOk,
    gqlFail,
    runScheduledWork: () => app.get(SchedulerService).runOnce(),
    close: async () => {
      try {
        await app.close();
        await db.$disconnect();
      } finally {
        restoreEnv();
      }
    },
  };
}
