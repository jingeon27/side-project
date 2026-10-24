import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';

const HIDE = 'mutation($id:ID!,$hidden:Boolean!){setPostHidden(postId:$id,hidden:$hidden)}';

describe('PostModerationService 이벤트 회귀', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let postId: string;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('숨김이벤트-그룹장');
    const group = await createGroup(api, owner, '숨김 이벤트 그룹');
    postId = (
      await api.gqlOk<{ createPost: { id: string } }>(
        owner.cookie,
        'mutation($id:ID!){createPost(groupId:$id,title:"숨김 이벤트 글",linkUrl:"https://example.com",rightsConfirmed:true){id}}',
        { id: group.id },
      )
    ).createPost.id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it('숨김과 해제를 반복하면 바뀐 횟수만큼 기록하고 같은 값 재요청은 기록하지 않아야 한다', async () => {
    // 같은 사실 id(post-visibility:<id>:<hidden>)를 써서 두 번째 숨김부터 기록이 사라졌다.
    for (const hidden of [true, false, true, true])
      await api.gqlOk(owner.cookie, HIDE, { id: postId, hidden });
    const events = await api.db.analyticsEvent.findMany({
      where: { type: 'post_visibility_changed', properties: { path: ['postId'], equals: postId } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(events).toHaveLength(3);
    expect(events.filter((event) => JSON.stringify(event.properties).includes('"hidden":true'))).toHaveLength(
      2,
    );
  });
});
