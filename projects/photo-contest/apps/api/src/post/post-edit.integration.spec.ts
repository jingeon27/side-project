import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';

const UPDATE =
  'mutation($id:ID!,$title:String!,$body:String,$categoryId:ID){updatePost(postId:$id,title:$title,body:$body,categoryId:$categoryId){id title body linkUrl author{id} category{id name}}}';

describe('게시물 수정', () => {
  let api: ITestApi,
    owner: ITestUser,
    author: ITestUser,
    member: ITestUser,
    outsider: ITestUser,
    moderator: ITestUser;
  let groupId: string;
  const create = async () =>
    (
      await api.gqlOk<{ createPost: { id: string } }>(
        author.cookie,
        'mutation($id:ID!){createPost(groupId:$id,title:"수정 전",body:"이전 본문",linkUrl:"https://example.com",rightsConfirmed:true){id}}',
        { id: groupId },
      )
    ).createPost.id;
  const category = async (id = groupId) =>
    (
      await api.gqlOk<{ createGroupCategory: { id: string } }>(
        owner.cookie,
        'mutation($id:ID!){createGroupCategory(groupId:$id,name:"편집 분류"){id}}',
        { id },
      )
    ).createGroupCategory.id;
  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('수정 관리자');
    author = await api.signIn('수정 작성자');
    member = await api.signIn('수정 회원');
    outsider = await api.signIn('수정 비회원');
    moderator = await api.signIn('수정 부관리자');
    groupId = (await createGroup(api, owner, '게시물 편집 그룹', [author, member, moderator])).id;
    await api.gqlOk(
      owner.cookie,
      'mutation($group:ID!,$user:ID!){setGroupModerator(groupId:$group,userId:$user,enabled:true){id}}',
      { group: groupId, user: moderator.id },
    );
  });
  afterAll(async () => api?.close());

  it('작성자·관리자·부관리자가 제목과 본문을 수정하고 작성자와 첨부는 보존해야 한다', async () => {
    const id = await create();
    expect(await api.gqlOk(author.cookie, UPDATE, { id, title: '제목만 수정' })).toMatchObject({
      updatePost: { body: '이전 본문' },
    });
    for (const user of [author, owner, moderator]) {
      expect(
        await api.gqlOk(user.cookie, UPDATE, { id, title: '  수정한 제목  ', body: '  새 본문  ' }),
      ).toMatchObject({
        updatePost: {
          id,
          title: '수정한 제목',
          body: '새 본문',
          linkUrl: 'https://example.com/',
          author: { id: author.id },
        },
      });
    }
    const events = await api.db.analyticsEvent.findMany({
      where: { type: 'post_updated', userId: { in: [author.id, owner.id, moderator.id] } },
    });
    expect(events.filter((event) => (event.properties as { postId: string }).postId === id)).toHaveLength(4);
    expect(events.every((event) => !JSON.stringify(event.properties).includes('새 본문'))).toBe(true);
  });

  it('다른 회원·비회원·비로그인의 수정은 거부하고 원문을 유지해야 한다', async () => {
    const id = await create();
    for (const user of [member, outsider])
      expect((await api.gqlFail(user.cookie, UPDATE, { id, title: '변조' })).code).toBe('FORBIDDEN');
    expect((await api.gqlFail(undefined, UPDATE, { id, title: '변조' })).code).toBe('UNAUTHENTICATED');
    expect(await api.db.post.findUniqueOrThrow({ where: { id } })).toMatchObject({
      title: '수정 전',
      body: '이전 본문',
    });
  });

  it('제목·본문 길이와 다른 그룹 분류를 검증하고 기존 보관 분류는 유지할 수 있어야 한다', async () => {
    const id = await create(),
      categoryId = await category();
    for (const variables of [
      { title: ' ' },
      { title: 'a'.repeat(81) },
      { title: '제목', body: 'a'.repeat(5001) },
    ])
      expect((await api.gqlFail(author.cookie, UPDATE, { id, ...variables })).code).toBe('BAD_USER_INPUT');
    expect((await api.gqlFail(author.cookie, UPDATE, { id, title: '빈 분류', categoryId: '' })).code).toBe(
      'BAD_USER_INPUT',
    );
    await api.gqlOk(author.cookie, UPDATE, { id, title: '분류 있음', categoryId });
    await api.gqlOk(owner.cookie, 'mutation($id:ID!){archiveGroupCategory(categoryId:$id){id}}', {
      id: categoryId,
    });
    expect(await api.gqlOk(author.cookie, UPDATE, { id, title: '보관 유지', categoryId })).toMatchObject({
      updatePost: { category: { id: categoryId } },
    });
    const otherId = (await createGroup(api, owner, '편집 외부 그룹')).id;
    const otherCategory = await category(otherId);
    expect(
      (await api.gqlFail(author.cookie, UPDATE, { id, title: '다른 그룹', categoryId: otherCategory })).code,
    ).toBe('BAD_USER_INPUT');
    await api.gqlOk(author.cookie, UPDATE, { id, title: '분류 해제', categoryId: null });
    expect((await api.db.post.findUniqueOrThrow({ where: { id } })).categoryId).toBeNull();
    expect((await api.gqlFail(author.cookie, UPDATE, { id, title: '보관 재지정', categoryId })).code).toBe(
      'BAD_USER_INPUT',
    );
  });

  it('숨긴 글은 관리자만 수정하고 삭제된 글은 찾을 수 없어야 한다', async () => {
    const id = await create();
    await api.gqlOk(owner.cookie, 'mutation($id:ID!){setPostHidden(postId:$id,hidden:true)}', { id });
    expect((await api.gqlFail(author.cookie, UPDATE, { id, title: '숨긴 글' })).code).toBe('NOT_FOUND');
    await api.gqlOk(owner.cookie, UPDATE, { id, title: '관리자 수정' });
    await api.gqlOk(owner.cookie, 'mutation($id:ID!){deletePost(postId:$id)}', { id });
    expect((await api.gqlFail(owner.cookie, UPDATE, { id, title: '삭제됨' })).code).toBe('NOT_FOUND');
  });
});
