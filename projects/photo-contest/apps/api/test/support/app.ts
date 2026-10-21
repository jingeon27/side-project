import { mkdir, mkdtemp } from 'node:fs/promises';
import type { Server } from 'node:http';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { inject } from 'vitest';

import { createDatabaseClient } from '@photo-contest/test-kit';

import { createApp } from '../../src/bootstrap';
import { SchedulerService } from '../../src/maintenance/scheduler.service';

/** 테스트 요청이 보내는 Origin. API는 listen하지 않으므로 실제 웹 서버와 겹치지 않는다. */
export const TEST_WEB_ORIGIN = 'http://web.test';
/** 한 테스트가 한꺼번에 보내는 요청 수의 상한 */
const CONCURRENT_REQUESTS_MAX = 32;

// 개발자 .env의 실제 키(OAuth·Sentry·S3)가 테스트 요청으로 새지 않도록 앱을 만들기 전에 지운다.
const CLEARED_ENV = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'KAKAO_CLIENT_ID',
  'KAKAO_CLIENT_SECRET',
  'MOBILE_APP_SCHEME',
  'MOBILE_MINIMUM_VERSION',
  'MOBILE_LATEST_VERSION',
  'SENTRY_DSN',
  'S3_BUCKET',
  'S3_REGION',
  'S3_ENDPOINT',
  'S3_FORCE_PATH_STYLE',
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
  /** 이 앱이 사진을 저장하는 임시 폴더 */
  storageDir: string;
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

let fileStorageDir: Promise<string> | undefined;

// 설정을 요청마다 읽으므로 한 파일의 앱들이 같은 폴더를 써야 먼저 만든 앱의 사진을 잃지 않는다.
function storageDirOfFile() {
  fileStorageDir ??= mkdir(inject('storageDir'), { recursive: true }).then(() =>
    mkdtemp(join(inject('storageDir'), 'photos-')),
  );
  return fileStorageDir;
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
 * 격리 스키마(globalSetup이 provide)를 보도록 환경변수를 맞춘 뒤 앱을 만든다. listen하지 않는다.
 * 설정은 요청마다 다시 읽히므로 테스트 안에서 바꾸는 값은 vi.stubEnv로 바꾼다(테스트가 끝나면 setup.ts가 되돌린다).
 * env로 넘긴 값은 close()가 되돌린다.
 */
export async function createTestApp(env: Record<string, string> = {}): Promise<ITestApi> {
  const storageDir = await storageDirOfFile();
  const restoreEnv = applyEnv({
    DATABASE_URL: inject('databaseUrl'),
    NODE_ENV: 'development',
    ENABLE_DEV_LOGIN: 'true',
    TRUST_PROXY_HOPS: '0',
    WEB_ORIGIN: TEST_WEB_ORIGIN,
    STORAGE_BACKEND: 'local',
    STORAGE_DIR: storageDir,
    ...env,
  });
  const app = await createApp({ logger: false }).catch((error: unknown) => {
    restoreEnv();
    throw error;
  });
  app.get(SchedulerService).stop();
  const db = createDatabaseClient(inject('databaseUrl'));

  const server: Server = app.getHttpServer();
  // supertest는 서버가 뜨기 전에 들어온 요청마다 'listening' 리스너를 하나씩 단다. 동시 요청 테스트가 기본 한도 10을 넘긴다.
  server.setMaxListeners(CONCURRENT_REQUESTS_MAX);
  const http = () => request(server);

  async function login(nickname: string) {
    const response = await http().post('/auth/dev').set('Origin', TEST_WEB_ORIGIN).send({ nickname });
    if (response.status !== 200) throw new Error(`개발 로그인 실패 (${response.status}): ${response.text}`);
    const cookies: string[] = [response.headers['set-cookie'] ?? []].flat();
    const session = cookies.find((cookie) => cookie.startsWith('contest_session='));
    if (!session) throw new Error('세션 Cookie가 없습니다.');
    return session.split(';')[0] ?? '';
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
    storageDir,
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
