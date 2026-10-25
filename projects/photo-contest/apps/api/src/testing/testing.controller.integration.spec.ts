import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, TEST_WEB_ORIGIN, type ITestApi } from '../../test/support/app';

describe('테스트 fixture API', () => {
  let api: ITestApi;
  beforeAll(async () => {
    api = await createTestApp({ NODE_ENV: 'test' });
  });
  afterAll(async () => {
    await api?.close();
  });
  const post = (path: string, body: Record<string, unknown>) =>
    api.http().post(path).set('Origin', TEST_WEB_ORIGIN).send(body);

  it('테스트 모드여도 명시적으로 등록하지 않은 fixture 경로는 열리지 않는다', async () => {
    const normal = await createTestApp({}, { testFixtures: false });
    try {
      const before = await normal.db.user.count();
      expect(
        (await normal.http().post('/testing/users').set('Origin', TEST_WEB_ORIGIN).send({ nickname: '차단' }))
          .status,
      ).toBe(404);
      expect(await normal.db.user.count()).toBe(before);
    } finally {
      await normal.close();
    }
  });

  it('테스트 모드 밖에서는 fixture를 명시적으로 요청해도 시작하지 않는다', async () => {
    await expect(createTestApp({ NODE_ENV: 'development' }, { testFixtures: true })).rejects.toThrow(
      'Test fixtures require NODE_ENV=test.',
    );
  });

  it('다른 출처의 요청과 잘못된 입력을 거절해야 한다', async () => {
    expect(
      (
        await api
          .http()
          .post('/testing/users')
          .set('Origin', 'https://outside.example')
          .send({ nickname: '외부' })
      ).status,
    ).toBe(403);
    for (const body of [{ nickname: '' }, { nickname: 'a'.repeat(25) }, { nickname: '정상', role: 'OWNER' }])
      expect((await post('/testing/users', body)).status).toBe(400);
    expect((await post('/testing/contests/missing/phase', { phase: 'UNKNOWN' })).status).toBe(400);
    expect((await post('/testing/contests/missing/phase', { phase: 'VOTING' })).status).toBe(404);
  });

  it('사용자와 HttpOnly 세션을 만들고 실제 GraphQL로 대회 단계를 확인할 수 있어야 한다', async () => {
    const response = await post('/testing/users', { nickname: 'fixture-사용자' });
    expect(response.status).toBe(201);
    const session = response.headers['set-cookie']?.[0] ?? '';
    expect(session).toContain('HttpOnly');
    const cookie = session.split(';')[0];
    const me = await api.gqlOk<{ me: { id: string; nickname: string } }>(cookie, '{ me { id nickname } }');
    expect(me.me).toEqual({ id: response.body.user.id, nickname: 'fixture-사용자' });
    const group = await api.gqlOk<{ createGroup: { id: string } }>(
      cookie,
      'mutation { createGroup(name: "fixture-그룹") { id } }',
    );
    const now = Date.now();
    const contest = await api.gqlOk<{ createContest: { id: string } }>(
      cookie,
      'mutation($groupId: ID!, $startsAt: DateTime!, $submissionEndsAt: DateTime!, $endsAt: DateTime!) { createContest(groupId: $groupId, title: "fixture", startsAt: $startsAt, submissionEndsAt: $submissionEndsAt, endsAt: $endsAt) { id } }',
      {
        groupId: group.createGroup.id,
        startsAt: new Date(now),
        submissionEndsAt: new Date(now + 60_000),
        endsAt: new Date(now + 120_000),
      },
    );
    for (const phase of ['UPCOMING', 'SUBMISSION', 'VOTING', 'COMPLETED']) {
      expect((await post(`/testing/contests/${contest.createContest.id}/phase`, { phase })).status).toBe(201);
      const data = await api.gqlOk<{ contest: { phase: string } }>(
        cookie,
        'query($id: ID!) { contest(id: $id) { phase } }',
        { id: contest.createContest.id },
      );
      expect(data.contest.phase).toBe(phase);
    }
  });
});
