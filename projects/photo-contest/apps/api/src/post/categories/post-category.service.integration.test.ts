import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../../test/support/app';
import { createGroup } from '../../../test/support/fixtures';

const CREATE_CATEGORY =
  'mutation($groupId:ID!,$name:String!){createGroupCategory(groupId:$groupId,name:$name){id}}';
const SET =
  'mutation($postId:ID!,$categoryId:ID){setPostCategory(postId:$postId,categoryId:$categoryId){id}}';

describe('PostCategoryService 이벤트 회귀', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let postId: string;
  let first: string;
  let second: string;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('분류이벤트-그룹장');
    const group = await createGroup(api, owner, '분류 이벤트 그룹');
    const category = async (name: string) =>
      (
        await api.gqlOk<{ createGroupCategory: { id: string } }>(owner.cookie, CREATE_CATEGORY, {
          groupId: group.id,
          name,
        })
      ).createGroupCategory.id;
    first = await category('첫 분류');
    second = await category('둘째 분류');
    postId = (
      await api.gqlOk<{ createPost: { id: string } }>(
        owner.cookie,
        'mutation($id:ID!){createPost(groupId:$id,title:"분류 이벤트 글",linkUrl:"https://example.com",rightsConfirmed:true){id}}',
        { id: group.id },
      )
    ).createPost.id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it('같은 분류로 되돌아가도 변경마다 기록하고 바뀌지 않은 요청은 기록하지 않아야 한다', async () => {
    // 같은 사실 id(post-category:<id>:<분류>)를 써서 A → B → A의 마지막 변경이 사라졌다.
    for (const categoryId of [first, second, first, first, null])
      await api.gqlOk(owner.cookie, SET, { postId, categoryId });
    const events = await api.db.analyticsEvent.findMany({
      where: { type: 'post_category_changed', properties: { path: ['postId'], equals: postId } },
    });
    expect(events).toHaveLength(4);
    expect(new Set(events.map((event) => event.id)).size).toBe(4);
  });
});
