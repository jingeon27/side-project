import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, TEST_WEB_ORIGIN, type ITestApi, type ITestUser } from '../../../test/support/app';
import { createGroup } from '../../../test/support/fixtures';

const CREATE =
  'mutation($group:ID!){createPost(groupId:$group,title:"계정 확인",linkUrl:"https://example.invalid/post",rightsConfirmed:true){id author{id}}}';

describe('계정 전환 뒤 오래된 화면의 쓰기 회귀', () => {
  const state: { api?: ITestApi; first?: ITestUser; second?: ITestUser; groupId?: string } = {};
  function fixture() {
    if (!state.api || !state.first || !state.second || !state.groupId)
      throw new Error('Expected an isolated account fixture.');
    return { api: state.api, first: state.first, second: state.second, groupId: state.groupId };
  }
  beforeAll(async () => {
    state.api = await createTestApp({}, { shutdownHooks: false });
    state.first = await state.api.signIn('계정전환-이전계정');
    state.second = await state.api.signIn('계정전환-현재계정');
    state.groupId = (await createGroup(state.api, state.second, '계정 전환 회귀', [state.first])).id;
  });
  afterAll(async () => {
    await state.api?.close();
  });

  it('A 화면의 기대 ID와 B 쿠키가 다르면 B의 권한으로 게시하지 않아야 한다', async () => {
    const { api, first, second, groupId } = fixture();
    const before = await api.db.post.count({ where: { groupId } });
    const response = await api
      .http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Cookie', second.cookie)
      .set('X-Expected-Viewer-Id', first.id)
      .send({ query: CREATE, variables: { group: groupId } })
      .expect(200);
    expect(response.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
    expect(await api.db.post.count({ where: { groupId } })).toBe(before);
    expect(JSON.stringify(response.body)).not.toContain(first.id);
    expect(JSON.stringify(response.body)).not.toContain(second.id);
    const current = await api.gqlOk<{ me: { id: string } }>(second.cookie, '{me{id}}');
    expect(current.me.id).toBe(second.id);
  });

  it('비로그인 화면의 sentinel도 새 로그인 쿠키와 대조하고 같은 actor일 때만 쓰기를 허용해야 한다', async () => {
    const { api, second, groupId } = fixture();
    const count = await api.db.post.count({ where: { groupId } });
    const stale = await api
      .http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Cookie', second.cookie)
      .set('X-Expected-Viewer-Id', 'anonymous')
      .send({ query: CREATE, variables: { group: groupId } })
      .expect(200);
    expect(stale.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
    expect(await api.db.post.count({ where: { groupId } })).toBe(count);
    const current = await api
      .http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('Cookie', second.cookie)
      .set('X-Expected-Viewer-Id', second.id)
      .send({ query: CREATE, variables: { group: groupId } })
      .expect(200);
    expect(current.body.errors).toBeUndefined();
    const post = await api.db.post.findUniqueOrThrow({
      where: { id: String(current.body.data.createPost.id) },
    });
    expect(post.authorId).toBe(second.id);
  });

  it('헤더 없는 기존 API와 의도적인 세션 확인은 그대로 동작해야 한다', async () => {
    const { api, second, groupId } = fixture();
    const created = await api.gqlOk<{ createPost: { author: { id: string } } }>(second.cookie, CREATE, {
      group: groupId,
    });
    expect(created.createPost.author.id).toBe(second.id);
    const anonymous = await api
      .http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('X-Expected-Viewer-Id', 'anonymous')
      .send({ query: '{me{id}}' })
      .expect(200);
    expect(anonymous.body).toMatchObject({ data: { me: null } });
    const changed = await api
      .http()
      .post('/graphql')
      .set('Origin', TEST_WEB_ORIGIN)
      .set('X-Expected-Viewer-Id', second.id)
      .send({ query: '{me{id}}' })
      .expect(200);
    expect(changed.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
    const session = await api.gqlOk<{ startAnonymousSession: { id: string } }>(
      second.cookie,
      'mutation{startAnonymousSession{id}}',
    );
    expect(session.startAnonymousSession.id).toBe(second.id);
  });
});
