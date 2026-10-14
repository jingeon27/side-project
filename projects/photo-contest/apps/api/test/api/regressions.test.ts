import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, TEST_WEB_ORIGIN } from '../support/app';
import type { ITestApi, ITestUser } from '../support/app';

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
});
