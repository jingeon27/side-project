import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestApp, TEST_WEB_ORIGIN, type ITestApi, type ITestUser } from '../../../test/support/app';
import { GroupService } from '../../group/group.service';
import { QUERY_COST_MESSAGE } from './query-cost.rule';

/** api 레인을 쓰면서 찾아 고친 버그. 같은 결함이 다시 생기면 여기서 드러난다. */
describe('확인된 버그 회귀', () => {
  let api: ITestApi;
  let user: ITestUser;

  beforeAll(async () => {
    api = await createTestApp();
    user = await api.signIn('회귀-사용자');
  });

  afterAll(async () => {
    await api?.close();
  });

  it('GraphQL 응답도 다른 응답과 같은 Cache-Control(private, no-store)이어야 한다', async () => {
    // Apollo 기본 cache control 플러그인이 no-store 미들웨어가 붙인 값을 `no-store`로 덮어썼다.
    const requests = [
      { query: '{ me { id } }', cookie: user.cookie },
      { query: '{ myGroups { id } }', cookie: undefined },
      { query: 'mutation { createGroup(name: "회귀 캐시 그룹") { id } }', cookie: user.cookie },
    ];
    for (const { query, cookie } of requests) {
      let pending = api.http().post('/graphql').set('Origin', TEST_WEB_ORIGIN);
      if (cookie) pending = pending.set('Cookie', cookie);
      const response = await pending.send({ query });
      expect(response.status, query).toBe(200);
      expect(response.headers['cache-control'], query).toBe('private, no-store');
    }
  });

  it('alias를 대량으로 넣은 익명 조회는 실행하기 전에 거절해야 한다', async () => {
    // depth 제한만 있어 discoverGroups alias 수천 개로 요청 하나가 수만 번 DB를 조회할 수 있었다.
    const discover = vi.spyOn(api.app.get(GroupService), 'discoverGroups');
    const query = `{ ${Array.from(
      { length: 500 },
      (_, index) => `g${index}: discoverGroups(limit: 48) { id categories { id } }`,
    ).join(' ')} }`;
    const response = await api
      .http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Apollo-Require-Preflight', 'true')
      .send({ query });
    expect(response.status).toBe(400);
    expect(response.body.data).toBeUndefined();
    expect(response.body.errors[0]).toMatchObject({
      message: QUERY_COST_MESSAGE.ALIASES,
      extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
    });
    expect(discover).not.toHaveBeenCalled();
    // 웹이 쓰는 크기의 조회는 그대로 통과한다.
    expect(
      await api.gqlOk(undefined, '{ discoverGroups(limit: 48) { id name memberCount categories { id } } }'),
    ).toHaveProperty('discoverGroups');
  });
});
