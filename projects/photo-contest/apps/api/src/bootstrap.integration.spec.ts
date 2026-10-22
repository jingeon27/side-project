import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestApp, TEST_WEB_ORIGIN, type ITestApi, type ITestUser } from '../test/support/app';

const NO_STORE = 'private, no-store';
const FORBIDDEN_ORIGIN = { message: '허용되지 않은 요청 출처입니다.' };
const LOGIN_REQUIRED = { code: 'UNAUTHENTICATED', message: '먼저 로그인해 주세요.' };
const UNREADABLE_BODY = { message: '요청 본문을 읽을 수 없습니다.' };

/** 상태를 바꾸는 모든 엔드포인트. 본문은 Origin이 맞았다면 처리됐을 값이다. */
const MUTATING_ENDPOINTS: Array<{ path: string; body?: Record<string, unknown> }> = [
  { path: '/graphql', body: { query: 'mutation { createGroup(name: "출처 검사 그룹") { id } }' } },
  { path: '/auth/dev', body: { nickname: '출처-외부인' } },
  { path: '/auth/logout' },
  { path: '/auth/app/exchange', body: { code: 'code', verifier: 'v'.repeat(43) } },
  { path: '/uploads/some-upload-token' },
];

const WRONG_ORIGINS = [
  'https://evil.example',
  'null',
  // 같은 호스트라도 scheme·port가 다르면 다른 출처다.
  'https://web.test',
  'http://web.test:8080',
];

/** 로그인이 필요한 모든 GraphQL 연산. 인자는 형식만 맞춘 값이다. */
const PROTECTED_OPERATIONS: Array<[string, string]> = [
  ['myGroups', '{ myGroups { id } }'],
  ['completeSubmissionUpload', 'mutation{completeSubmissionUpload(uploadId:"upload")}'],
  ['requestGroupMembership', 'mutation { requestGroupMembership(groupId: "group") { id } }'],
  ['approveGroupJoinRequest', 'mutation { approveGroupJoinRequest(requestId: "request") }'],
  ['rejectGroupJoinRequest', 'mutation { rejectGroupJoinRequest(requestId: "request") }'],
  ['groupJoinRequests', '{ groupJoinRequests(groupId: "group") { id } }'],
  ['contest', '{ contest(id: "contest") { id } }'],
  ['contestResults', '{ contestResults(contestId: "contest") { rank } }'],
  ['submissions', '{ submissions(contestId: "contest") { id } }'],
  ['createGroup', 'mutation { createGroup(name: "그룹") { id } }'],
  ['joinGroup', 'mutation { joinGroup(token: "token") { id } }'],
  ['regenerateInviteLink', 'mutation { regenerateInviteLink(groupId: "group") { id } }'],
  [
    'createContest',
    'mutation { createContest(groupId: "group", title: "대회", startsAt: "2030-01-01T00:00:00Z", submissionEndsAt: "2030-01-02T00:00:00Z", endsAt: "2030-01-03T00:00:00Z") { id } }',
  ],
  [
    'requestUploadUrl',
    'mutation { requestUploadUrl(contestId: "contest", contentType:"image/png", byteSize:1) { id } }',
  ],
  [
    'createSubmission',
    'mutation { createSubmission(contestId: "contest", uploadId: "upload", caption: "설명", rightsConfirmed: true) { id } }',
  ],
  ['likeSubmission', 'mutation { likeSubmission(submissionId: "submission") { id } }'],
  ['unlikeSubmission', 'mutation { unlikeSubmission(submissionId: "submission") { id } }'],
  ['castVote', 'mutation { castVote(contestId: "contest", submissionId: "submission") { id } }'],
  ['reportSubmission', 'mutation { reportSubmission(submissionId: "submission", reason: "이유") }'],
  ['hideSubmission', 'mutation { hideSubmission(submissionId: "submission") }'],
  ['deleteSubmission', 'mutation { deleteSubmission(submissionId: "submission") }'],
];

describe('HTTP 계약', () => {
  let api: ITestApi;
  let user: ITestUser;

  beforeAll(async () => {
    api = await createTestApp();
    user = await api.signIn('계약-사용자');
  });

  afterAll(async () => {
    await api?.close();
  });

  it('사용하지 않는 raw 게시물 업로드 경로를 등록하지 않아야 한다', async () => {
    const response = await api
      .http()
      .post('/post-uploads/unused')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Content-Type', 'video/mp4');
    expect(response.status).toBe(404);
    expect(
      (
        await api
          .http()
          .post('/uploads/unused')
          .set('Origin', TEST_WEB_ORIGIN)
          .set('Content-Type', 'image/png')
      ).status,
    ).toBe(404);
  });

  describe('Origin 검사', () => {
    it.each(MUTATING_ENDPOINTS)('POST $path는 Origin이 없으면 403이어야 한다', async ({ path, body }) => {
      const response = await api.http().post(path).set('Cookie', user.cookie).send(body);
      expect(response.status).toBe(403);
      expect(response.body).toEqual(FORBIDDEN_ORIGIN);
    });

    it.each(MUTATING_ENDPOINTS)(
      'POST $path는 다른 출처의 Origin이면 403이어야 한다',
      async ({ path, body }) => {
        for (const origin of WRONG_ORIGINS) {
          const response = await api
            .http()
            .post(path)
            .set('Origin', origin)
            .set('Cookie', user.cookie)
            .send(body);
          expect(response.status, origin).toBe(403);
          expect(response.body, origin).toEqual(FORBIDDEN_ORIGIN);
        }
      },
    );

    it('거절한 요청은 로그인·그룹 생성·로그아웃 어느 것도 처리하지 않아야 한다', async () => {
      const devLogin = await api
        .http()
        .post('/auth/dev')
        .set('Origin', 'https://evil.example')
        .send({ nickname: '출처-외부인' });
      expect(devLogin.headers['set-cookie']).toBeUndefined();
      await api
        .http()
        .post('/graphql')
        .set('Origin', 'https://evil.example')
        .set('Cookie', user.cookie)
        .send({ query: 'mutation { createGroup(name: "출처 검사 그룹") { id } }' });
      await api.http().post('/auth/logout').set('Origin', 'https://evil.example').set('Cookie', user.cookie);

      expect(await api.db.user.count({ where: { nickname: '출처-외부인' } })).toBe(0);
      expect(await api.db.group.count({ where: { name: '출처 검사 그룹' } })).toBe(0);
      expect(await api.gqlOk(user.cookie, '{ me { id } }')).toEqual({ me: { id: user.id } });
    });

    it('PUT·PATCH·DELETE도 Origin이 맞지 않으면 403이어야 한다', async () => {
      for (const method of ['put', 'patch', 'delete'] as const) {
        const response = await api.http()[method]('/graphql').set('Cookie', user.cookie);
        expect(response.status, method).toBe(403);
        expect(response.body, method).toEqual(FORBIDDEN_ORIGIN);
      }
    });

    it('업로드는 로그인·티켓 확인보다 먼저 Origin을 검사해야 한다', async () => {
      const response = await api.http().post('/uploads/some-upload-token').set('Content-Type', 'image/png');
      expect(response.status).toBe(403);
      expect(response.body).toEqual(FORBIDDEN_ORIGIN);
    });
  });

  describe('GraphQL CSRF 방지', () => {
    it('preflight가 필요 없는 단순 요청(text/plain·form)은 400으로 막고 실행하지 않아야 한다', async () => {
      const query = JSON.stringify({ query: 'mutation { createGroup(name: "CSRF 그룹") { id } }' });
      for (const contentType of ['text/plain', 'application/x-www-form-urlencoded']) {
        const response = await api
          .http()
          .post('/graphql')
          .set('Origin', TEST_WEB_ORIGIN)
          .set('Cookie', user.cookie)
          .set('Content-Type', contentType)
          .send(query);
        expect(response.status, contentType).toBe(400);
      }
      expect(await api.db.group.count({ where: { name: 'CSRF 그룹' } })).toBe(0);
    });

    it('GET 요청은 preflight 헤더가 없으면 400이고 있으면 조회를 처리해야 한다', async () => {
      const blocked = await api
        .http()
        .get('/graphql')
        .query({ query: '{ me { id } }' })
        .set('Cookie', user.cookie);
      expect(blocked.status).toBe(400);

      const allowed = await api
        .http()
        .get('/graphql')
        .query({ query: '{ me { id } }' })
        .set('Cookie', user.cookie)
        .set('Apollo-Require-Preflight', 'true');
      expect(allowed.status).toBe(200);
      expect(allowed.body).toEqual({ data: { me: { id: user.id } } });
    });

    it('GET으로 보낸 mutation은 실행하지 않아야 한다', async () => {
      const response = await api
        .http()
        .get('/graphql')
        .query({ query: 'mutation { createGroup(name: "GET 그룹") { id } }' })
        .set('Cookie', user.cookie)
        .set('Apollo-Require-Preflight', 'true');
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(await api.db.group.count({ where: { name: 'GET 그룹' } })).toBe(0);
    });

    it('JSON 요청은 브라우저가 preflight를 거치므로 헤더 없이도 처리해야 한다', async () => {
      const response = await api
        .http()
        .post('/graphql')
        .set('Origin', TEST_WEB_ORIGIN)
        .set('Cookie', user.cookie)
        .send({ query: '{ me { id } }' });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: { me: { id: user.id } } });
    });
  });

  describe('Cache-Control', () => {
    it('성공·오류·리다이렉트 모든 응답에 private, no-store를 붙여야 한다', async () => {
      vi.stubEnv('GOOGLE_CLIENT_ID', 'contract-google-client');
      const responses = {
        health: await api.http().get('/health'),
        appConfig: await api.http().get('/app/config'),
        authConfig: await api.http().get('/auth/config'),
        devLogin: await api
          .http()
          .post('/auth/dev')
          .set('Origin', TEST_WEB_ORIGIN)
          .send({ nickname: '계약-캐시' }),
        graphql: await api
          .http()
          .post('/graphql')
          .set('Origin', TEST_WEB_ORIGIN)
          .set('Cookie', user.cookie)
          .send({ query: '{ me { id } myGroups { id } }' }),
        graphqlError: await api
          .http()
          .post('/graphql')
          .set('Origin', TEST_WEB_ORIGIN)
          .send({ query: '{ myGroups { id } }' }),
        graphqlInvalid: await api
          .http()
          .post('/graphql')
          .set('Origin', TEST_WEB_ORIGIN)
          .send({ query: '{ unknownField }' }),
        oauthRedirect: await api.http().get('/auth/google'),
        oauthCallback: await api.http().get('/auth/google/callback'),
        unsupportedProvider: await api.http().get('/auth/unknown'),
        forbiddenOrigin: await api.http().post('/auth/dev').send({ nickname: '계약-캐시' }),
        photoLoggedOut: await api.http().get('/photos/unknown'),
        photoMissing: await api.http().get('/photos/unknown').set('Cookie', user.cookie),
        routeMissing: await api.http().get('/missing-route'),
      };
      expect(responses.oauthRedirect.status).toBe(302);
      for (const [name, response] of Object.entries(responses))
        expect(response.headers['cache-control'], name).toBe(NO_STORE);
    });
  });

  describe('로그인이 필요한 요청', () => {
    it.each(PROTECTED_OPERATIONS)('비로그인 %s는 UNAUTHENTICATED여야 한다', async (_name, query) => {
      expect(await api.gqlFail(undefined, query)).toEqual(LOGIN_REQUIRED);
    });

    it('비로그인 me는 null이고 초대 미리보기는 로그인 없이 처리해야 한다', async () => {
      expect(await api.gql(undefined, '{ me { id } }')).toEqual({ data: { me: null } });
      expect(await api.gqlFail(undefined, '{ invitePreview(token: "없는 초대") { groupName } }')).toEqual({
        code: 'NOT_FOUND',
        message: '유효하지 않은 초대 링크입니다.',
      });
    });

    it('비로그인 사진 요청은 401이어야 한다', async () => {
      const response = await api.http().get('/photos/any-photo');
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ message: LOGIN_REQUIRED.message });
    });

    it('삭제한 raw 업로드 경로는 로그인 여부와 관계없이 404여야 한다', async () => {
      for (const cookie of ['', user.cookie]) {
        const response = await api
          .http()
          .post('/uploads/garbage-token')
          .set('Origin', TEST_WEB_ORIGIN)
          .set('Cookie', cookie)
          .set('Content-Type', 'image/png')
          .send(Buffer.from('photo'));
        expect(response.status).toBe(404);
      }
    });
  });

  describe('REST 오류 응답', () => {
    it('지원하지 않는 provider는 400이어야 한다', async () => {
      const response = await api.http().get('/auth/unknown');
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: '지원하지 않는 로그인입니다.' });
    });

    it('client id가 없는 provider는 503이어야 한다', async () => {
      for (const provider of ['google', 'kakao']) {
        const response = await api.http().get(`/auth/${provider}`);
        expect(response.status, provider).toBe(503);
        expect(response.body, provider).toEqual({ message: '이 소셜 로그인은 아직 설정되지 않았습니다.' });
      }
    });

    it('엉터리 앱 로그인 교환은 모두 같은 403이어야 한다', async () => {
      const bodies = [{}, { code: 'unknown-code', verifier: 'v'.repeat(43) }, { code: 1, verifier: [] }];
      for (const body of bodies) {
        const response = await api
          .http()
          .post('/auth/app/exchange')
          .set('Origin', TEST_WEB_ORIGIN)
          .send(body);
        expect(response.status, JSON.stringify(body)).toBe(403);
        expect(response.body).toEqual({ message: '앱 로그인 요청을 확인할 수 없습니다.' });
        expect(response.headers['set-cookie']).toBeUndefined();
      }
    });

    it('깨진 JSON은 400, 64KB를 넘는 JSON은 413으로 같은 형식의 오류를 돌려줘야 한다', async () => {
      const broken = await api
        .http()
        .post('/graphql')
        .set('Origin', TEST_WEB_ORIGIN)
        .set('Content-Type', 'application/json')
        .send('{"query":');
      expect(broken.status).toBe(400);
      expect(broken.body).toEqual(UNREADABLE_BODY);

      const large = await api
        .http()
        .post('/graphql')
        .set('Origin', TEST_WEB_ORIGIN)
        .send({ query: '{ me { id } }', variables: { padding: 'x'.repeat(65 * 1024) } });
      expect(large.status).toBe(413);
      expect(large.body).toEqual(UNREADABLE_BODY);
    });
  });

  describe('GraphQL 보호 장치', () => {
    it('깊이 8을 넘는 쿼리는 거부해야 한다', async () => {
      const deep = '{ me { a { b { c { d { e { f { g { h { i } } } } } } } } } }';
      const result = await api.gql(user.cookie, deep);
      expect(result.data).toBeUndefined();
      expect(result.errors?.map((error) => error.message)).toContainEqual(
        expect.stringMatching(/exceeds maximum operation depth of 8/),
      );
    });

    it('운영 모드에서는 introspection을 막고 오류에 stacktrace를 싣지 않아야 한다', async () => {
      const production = await createTestApp({ NODE_ENV: 'production', WEB_ORIGIN: 'https://web.test' });
      try {
        const response = await production
          .http()
          .post('/graphql')
          .set('Origin', 'https://web.test')
          .send({ query: '{ __schema { queryType { name } } }' });
        expect(response.body.data).toBeUndefined();
        expect(response.body.errors[0].extensions.code).toBe('GRAPHQL_VALIDATION_FAILED');
        // 운영 오류 응답에는 서버 내부 호출 위치를 싣지 않는다.
        expect(response.body.errors[0].extensions.stacktrace).toBeUndefined();
      } finally {
        await production.close();
      }
      // 개발 모드 앱은 그대로 introspection을 허용한다.
      expect(await api.gqlOk(user.cookie, '{ __schema { queryType { name } } }')).toEqual({
        __schema: { queryType: { name: 'Query' } },
      });
    });
  });
});
