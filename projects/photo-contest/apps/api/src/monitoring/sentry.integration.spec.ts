import { captureException, init } from '@sentry/node';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestApp, TEST_WEB_ORIGIN, type ITestApi, type ITestUser } from '../../test/support/app';
import { cookiePair, findSetCookie } from '../../test/support/cookies';
import { stubExternalFetch } from '../../test/support/external-fetch';
import { createContest, createGroup } from '../../test/support/fixtures';
import { submitPhoto } from '../../test/support/photos';
import { ContestCompletionService } from '../analytics/contest-completion.service';
import { AuthService } from '../auth/auth.service';
import { GroupService } from '../group/group.service';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { PhotoStorage } from '../storage/photo-storage.service';

// 실제 구현은 그대로 두고 호출만 지켜본다. SENTRY_DSN이 없으므로 밖으로는 아무것도 나가지 않는다.
vi.mock('@sentry/node', { spy: true });

const SECRET = '비밀-원문-5f1c';
const INTERNAL_MESSAGE = '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';

/** 보고된 오류·태그 전체를 문자열로. 원문·쿠키·본문이 섞였는지 본다. */
function reportedPayload() {
  return vi
    .mocked(captureException)
    .mock.calls.map(([error, context]) => {
      const stack = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
      return `${stack}\n${JSON.stringify(context)}`;
    })
    .join('\n');
}

function reportedCalls() {
  return vi.mocked(captureException).mock.calls.map(([error, context]) => ({
    message: error instanceof Error ? error.message : String(error),
    context,
  }));
}

describe('Sentry 오류 보고', () => {
  let api: ITestApi;
  let member: ITestUser;
  let outsider: ITestUser;
  let groupId: string;
  let photoId: string;

  beforeAll(async () => {
    api = await createTestApp();
    member = await api.signIn('보고-멤버');
    outsider = await api.signIn('보고-외부인');
    ({ id: groupId } = await createGroup(api, member, '보고 그룹'));
    const contestId = await createContest(api, member, groupId, '보고 대회');
    photoId = await submitPhoto(api, member, contestId, '보고 사진');
  });

  afterAll(async () => {
    await api?.close();
  });

  beforeEach(() => {
    vi.mocked(captureException).mockClear();
  });

  function graphql(cookie: string | undefined, body: Record<string, unknown>) {
    let pending = api.http().post('/graphql').set('Origin', TEST_WEB_ORIGIN);
    if (cookie) pending = pending.set('Cookie', cookie);
    return pending.send(body);
  }

  it('SENTRY_DSN이 없으면 시작 시 Sentry를 초기화하지 않아야 한다', async () => {
    await import('../instrumentation');
    expect(init).not.toHaveBeenCalled();
  });

  it('4xx 업무 오류와 GraphQL 요청 오류는 보내지 않아야 한다', async () => {
    const graphqlFailures = [
      [undefined, '{ myGroups { id } }'],
      [outsider.cookie, `{ group(id: "${groupId}") { id } }`],
      [member.cookie, '{ contest(id: "missing-contest") { id } }'],
      [member.cookie, 'mutation { createGroup(name: "") { id } }'],
      [member.cookie, '{ unknownField }'],
      [member.cookie, '{ myGroups { id }'],
    ] as const;
    for (const [cookie, query] of graphqlFailures) {
      const response = await graphql(cookie, { query });
      expect(response.body.errors?.[0]?.extensions?.code, query).not.toBe('INTERNAL_SERVER_ERROR');
    }
    const csrf = await api
      .http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Content-Type', 'text/plain')
      .send('{"query":"{ me { id } }"}');
    expect(csrf.status).toBe(400);

    // supertest는 요청마다 서버를 잠깐 열고 닫으므로 요청은 보낼 때 만든다.
    const restFailures = [
      [400, () => api.http().get('/auth/unknown')],
      [401, () => api.http().get(`/photos/${photoId}`)],
      [403, () => api.http().get(`/photos/${photoId}`).set('Cookie', outsider.cookie)],
      [404, () => api.http().get('/photos/missing-photo').set('Cookie', member.cookie)],
      [404, () => api.http().get('/missing-route')],
      [403, () => api.http().post('/auth/dev').send({ nickname: '출처 없음' })],
      [
        403,
        () =>
          api.http().post('/uploads/bad-token').set('Origin', TEST_WEB_ORIGIN).set('Cookie', member.cookie),
      ],
      [
        403,
        () =>
          api
            .http()
            .post('/auth/app/exchange')
            .set('Origin', TEST_WEB_ORIGIN)
            .send({ code: 'x', verifier: 'y' }),
      ],
      [
        400,
        () =>
          api
            .http()
            .post('/auth/dev')
            .set('Origin', TEST_WEB_ORIGIN)
            .set('Content-Type', 'application/json')
            .send('{"nickname":'),
      ],
    ] as const;
    for (const [status, send] of restFailures) expect((await send()).status).toBe(status);
    // state가 맞지 않는 OAuth 콜백도 예상한 실패다.
    vi.stubEnv('GOOGLE_CLIENT_ID', 'monitoring-google-client');
    expect((await api.http().get('/auth/google/callback').query({ state: 's', code: 'c' })).status).toBe(302);

    expect(captureException).not.toHaveBeenCalled();
  });

  it('GraphQL 내부 오류는 응답에서 가리고 operationName 태그와 함께 원문 없이 보내야 한다', async () => {
    vi.spyOn(api.app.get(GroupService), 'myGroups').mockRejectedValueOnce(
      new Error(`connect ECONNREFUSED ${SECRET}`),
    );
    const response = await graphql(member.cookie, {
      query: 'query MyGroups { myGroups { id } }',
      operationName: 'MyGroups',
      variables: { note: `${SECRET}-본문` },
    });
    expect(response.status).toBe(200);
    expect(response.body.errors).toEqual([
      expect.objectContaining({ message: INTERNAL_MESSAGE, extensions: { code: 'INTERNAL_SERVER_ERROR' } }),
    ]);
    expect(JSON.stringify(response.body)).not.toContain(SECRET);

    expect(reportedCalls()).toEqual([
      { message: 'Unexpected Error', context: { tags: { operationName: 'MyGroups' } } },
    ]);
    const payload = reportedPayload();
    expect(payload).not.toContain(SECRET);
    expect(payload).not.toContain(member.cookie.split('=')[1]);
    // 원문 대신 호출 위치는 남긴다.
    expect(payload).toContain('sentry.integration.spec.ts');

    vi.mocked(captureException).mockClear();
    vi.spyOn(api.app.get(GroupService), 'myGroups').mockRejectedValueOnce(new Error(SECRET));
    await graphql(member.cookie, { query: '{ myGroups { id } }' });
    expect(reportedCalls()).toEqual([
      { message: 'Unexpected Error', context: { tags: { operationName: 'anonymous' } } },
    ]);
  });

  it('REST 5xx는 라우트 패턴 태그와 함께 원문·쿠키·본문 없이 보내야 한다', async () => {
    vi.spyOn(api.app.get(PhotoStorage), 'get').mockRejectedValueOnce(new Error(`EACCES ${SECRET}`));
    const photo = await api.http().get(`/photos/${photoId}`).set('Cookie', member.cookie);
    expect(photo.status).toBe(500);
    expect(photo.text).not.toContain(SECRET);

    vi.spyOn(api.app.get(AuthService), 'devLogin').mockRejectedValueOnce(new Error(`unique ${SECRET}`));
    const login = await api
      .http()
      .post('/auth/dev')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Cookie', member.cookie)
      .send({ nickname: `${SECRET}-닉네임` });
    expect(login.status).toBe(500);
    expect(login.text).not.toContain(SECRET);

    // 설정이 빠진 provider도 서버 쪽 문제(503)이므로 보고한다.
    expect((await api.http().get('/auth/kakao')).status).toBe(503);

    expect(reportedCalls()).toEqual([
      { message: 'Unexpected Error', context: { tags: { route: 'GET /photos/:id' } } },
      { message: 'Unexpected Error', context: { tags: { route: 'POST /auth/dev' } } },
      { message: 'Unexpected GraphQLError UNAVAILABLE', context: { tags: { route: 'GET /auth/:provider' } } },
    ]);
    const payload = reportedPayload();
    expect(payload).not.toContain(SECRET);
    expect(payload).not.toContain(photoId);
    expect(payload).not.toContain(member.cookie.split('=')[1]);
  });

  it('OAuth 콜백에서 provider와 통신하지 못하면 웹으로 돌려보내고 라우트 태그로 보내야 한다', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'monitoring-google-client');
    const start = await api.http().get('/auth/google');
    const state = new URL(String(start.headers.location)).searchParams.get('state') ?? '';
    const stateCookie = findSetCookie(start, 'contest_oauth_state') ?? '';
    stubExternalFetch({
      'https://oauth2.googleapis.com/token': () => {
        throw new TypeError(`fetch failed ${SECRET}`);
      },
    });

    const callback = await api
      .http()
      .get('/auth/google/callback')
      .query({ state, code: `${SECRET}-code` })
      .set('Cookie', cookiePair(stateCookie));
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe(`${TEST_WEB_ORIGIN}/?loginError=1`);
    expect(reportedCalls()).toEqual([
      { message: 'Unexpected TypeError', context: { tags: { route: 'GET /auth/:provider/callback' } } },
    ]);
    expect(reportedPayload()).not.toContain(SECRET);
  });

  it('주기 작업이 여러 단계에서 실패하면 처음 실패는 던지고 나머지는 job 태그로 보내야 한다', async () => {
    const cleanup = vi
      .spyOn(api.app.get(MaintenanceService), 'cleanup')
      .mockRejectedValueOnce(new Error(`정리 ${SECRET}`));
    const completion = vi
      .spyOn(api.app.get(ContestCompletionService), 'recordCompletedContests')
      .mockRejectedValueOnce(new Error(`기록 ${SECRET}`));
    try {
      await expect(api.runScheduledWork()).rejects.toThrow(`정리 ${SECRET}`);
    } finally {
      cleanup.mockRestore();
      completion.mockRestore();
    }
    expect(reportedCalls()).toEqual([
      { message: 'Unexpected Error', context: { tags: { job: 'maintenance' } } },
    ]);
    expect(reportedPayload()).not.toContain(SECRET);
  });
});
