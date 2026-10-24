import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';

const CREATE =
  'mutation($groupId:ID!,$name:String!){createGroupCategory(groupId:$groupId,name:$name){id name position archivedAt}}';
const RENAME =
  'mutation($categoryId:ID!,$name:String!){renameGroupCategory(categoryId:$categoryId,name:$name){id name}}';
const ARCHIVE = 'mutation($id:ID!){archiveGroupCategory(categoryId:$id){id archivedAt}}';
const REORDER =
  'mutation($groupId:ID!,$ids:[ID!]!){reorderGroupCategories(groupId:$groupId,categoryIds:$ids){id position}}';
const POST =
  'mutation($groupId:ID!,$categoryId:ID,$contestId:ID){createPost(groupId:$groupId,categoryId:$categoryId,contestId:$contestId,title:"카테고리 글",linkUrl:"https://example.com",rightsConfirmed:true){id category{id name archivedAt}}}';
const SET =
  'mutation($postId:ID!,$categoryId:ID){setPostCategory(postId:$postId,categoryId:$categoryId){id category{id name}}}';
interface ICategory {
  id: string;
  name: string;
  position: number;
  archivedAt: string | null;
}
interface IPost {
  id: string;
  category: ICategory | null;
}

describe('그룹 카테고리와 게시물 분류', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let moderator: ITestUser;
  let member: ITestUser;
  let outsider: ITestUser;
  beforeAll(async () => {
    api = await createTestApp();
    [owner, moderator, member, outsider] = await Promise.all([
      api.signIn('카테고리-그룹장'),
      api.signIn('카테고리-부관리자'),
      api.signIn('카테고리-멤버'),
      api.signIn('카테고리-외부인'),
    ]);
  });
  afterAll(async () => {
    await api?.close();
  });
  const group = async (visibility = 'PRIVATE') => {
    const { createGroup: g } = await api.gqlOk<{ createGroup: { id: string } }>(
      owner.cookie,
      'mutation($v:GroupVisibility!){createGroup(name:"카테고리 그룹",visibility:$v){id}}',
      { v: visibility },
    );
    for (const user of [moderator, member])
      await api.db.groupMember.create({
        data: { groupId: g.id, userId: user.id, role: user === moderator ? 'MODERATOR' : 'MEMBER' },
      });
    return g.id;
  };
  const category = async (groupId: string, name = '웃긴 사진', cookie = owner.cookie) =>
    (await api.gqlOk<{ createGroupCategory: ICategory }>(cookie, CREATE, { groupId, name }))
      .createGroupCategory;
  const createPost = async (groupId: string, categoryId?: string, cookie = member.cookie) =>
    (await api.gqlOk<{ createPost: IPost }>(cookie, POST, { groupId, categoryId })).createPost;

  it('그룹장과 부관리자만 카테고리를 만들 수 있어야 한다', async () => {
    const id = await group();
    for (const cookie of [undefined, outsider.cookie, member.cookie])
      expect((await api.gqlFail(cookie, CREATE, { groupId: id, name: '금지' })).code).toBe(
        cookie ? 'FORBIDDEN' : 'UNAUTHENTICATED',
      );
    expect(await category(id, '  합성  ')).toMatchObject({ name: '합성', position: 0 });
    expect(await category(id, '영상', moderator.cookie)).toMatchObject({ name: '영상', position: 1 });
  });
  it('비공개 그룹의 카테고리는 익명과 비멤버에게 보이지 않아야 한다', async () => {
    const id = await group();
    const cat = await category(id);
    const query = 'query($id:ID!){group(id:$id){id categories{id}}}';
    for (const cookie of [undefined, outsider.cookie])
      expect(await api.gqlOk(cookie, query, { id })).toEqual({ group: { id, categories: [] } });
    expect(await api.gqlOk(member.cookie, query, { id })).toEqual({
      group: { id, categories: [{ id: cat.id }] },
    });
  });
  it('공개 그룹의 카테고리는 익명도 읽을 수 있어야 한다', async () => {
    const id = await group('PUBLIC');
    const cat = await category(id);
    expect(await api.gqlOk(undefined, 'query($id:ID!){group(id:$id){categories{id}}}', { id })).toEqual({
      group: { categories: [{ id: cat.id }] },
    });
  });
  it.each(['', ' '.repeat(2), '글'.repeat(21)])('유효하지 않은 이름 %j를 거부해야 한다', async (name) => {
    expect(await api.gqlFail(owner.cookie, CREATE, { groupId: await group(), name })).toMatchObject({
      code: 'BAD_USER_INPUT',
    });
  });
  it('동시 생성의 대소문자 중복을 DB unique가 막고 CONFLICT로 알려야 한다', async () => {
    const groupId = await group();
    const results = await Promise.all(
      ['Funny', 'funny'].map((name) => api.gql(owner.cookie, CREATE, { groupId, name })),
    );
    expect(results.filter((r) => r.data)).toHaveLength(1);
    expect(results.flatMap((r) => r.errors ?? [])).toEqual([
      expect.objectContaining({
        message: '이미 있는 카테고리예요.',
        extensions: expect.objectContaining({ code: 'CONFLICT' }),
      }),
    ]);
    expect(await api.db.groupCategory.count({ where: { groupId } })).toBe(1);
  });
  it('수정 시에도 활성 카테고리 이름 중복을 막아야 한다', async () => {
    const groupId = await group();
    await category(groupId, '사진');
    const cat = await category(groupId, '영상');
    expect(await api.gqlFail(owner.cookie, RENAME, { categoryId: cat.id, name: '사진' })).toMatchObject({
      code: 'CONFLICT',
    });
  });
  it('그룹의 모든 활성 ID를 한 번씩 받아 순서를 원자적으로 바꿔야 한다', async () => {
    const groupId = await group();
    const a = await category(groupId, '첫째');
    const b = await category(groupId, '둘째');
    expect(await api.gqlOk(moderator.cookie, REORDER, { groupId, ids: [b.id, a.id] })).toEqual({
      reorderGroupCategories: [
        { id: b.id, position: 0 },
        { id: a.id, position: 1 },
      ],
    });
    for (const ids of [[a.id], [a.id, a.id], [a.id, '다른-ID']])
      expect(await api.gqlFail(owner.cookie, REORDER, { groupId, ids })).toMatchObject({
        code: 'BAD_USER_INPUT',
      });
  });
  it('활성 카테고리는 20개로 제한하고 보관하면 새 카테고리를 만들 수 있어야 한다', async () => {
    const groupId = await group();
    const ids: string[] = [];
    for (let index = 0; index < 20; index += 1) ids.push((await category(groupId, `분류 ${index}`)).id);
    expect(await api.gqlFail(owner.cookie, CREATE, { groupId, name: '스물한 번째' })).toMatchObject({
      code: 'BAD_USER_INPUT',
    });
    await api.gqlOk(owner.cookie, ARCHIVE, { id: ids[0] });
    expect(await category(groupId, '새 분류')).toHaveProperty('id');
  });
  it('보관된 카테고리는 새 선택에서 제외하고 기존 글의 라벨은 남겨야 한다', async () => {
    const groupId = await group();
    const cat = await category(groupId);
    const post = await createPost(groupId, cat.id);
    await api.gqlOk(owner.cookie, ARCHIVE, { id: cat.id });
    expect(await api.gqlFail(member.cookie, POST, { groupId, categoryId: cat.id })).toMatchObject({
      code: 'BAD_USER_INPUT',
    });
    const result = await api.gqlOk<{ galleryPost: IPost }>(
      member.cookie,
      'query($id:ID!){galleryPost(id:$id){id category{id name archivedAt}}}',
      { id: post.id },
    );
    expect(result.galleryPost.category).toMatchObject({
      id: cat.id,
      name: cat.name,
      archivedAt: expect.any(String),
    });
    expect(await category(groupId, cat.name)).toHaveProperty('id');
  });
  it('다른 그룹 카테고리는 앱과 DB 복합 FK가 모두 거부해야 한다', async () => {
    const groupId = await group();
    const other = await group();
    const cat = await category(other);
    expect(await api.gqlFail(member.cookie, POST, { groupId, categoryId: cat.id })).toMatchObject({
      code: 'BAD_USER_INPUT',
    });
    await expect(
      api.db.post.create({
        data: {
          groupId,
          authorId: member.id,
          title: '우회 시도',
          linkUrl: 'https://example.com',
          categoryId: cat.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    const post = await createPost(other, cat.id);
    await expect(
      api.db.groupCategory.update({ where: { id: cat.id }, data: { groupId } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    expect((await api.db.post.findUniqueOrThrow({ where: { id: post.id } })).groupId).toBe(other);
  });
  it('작성자와 관리자만 분류를 바꾸고 미분류로 되돌릴 수 있어야 한다', async () => {
    const groupId = await group();
    const cat = await category(groupId);
    const post = await createPost(groupId);
    // 비공개 그룹의 게시물은 비멤버에게 있는지도 알리지 않는다.
    expect(await api.gqlFail(outsider.cookie, SET, { postId: post.id, categoryId: cat.id })).toMatchObject({
      code: 'NOT_FOUND',
    });
    await api.gqlOk(member.cookie, SET, { postId: post.id, categoryId: cat.id });
    expect(await api.gqlOk(moderator.cookie, SET, { postId: post.id, categoryId: null })).toEqual({
      setPostCategory: { id: post.id, category: null },
    });
    const othersPost = await createPost(groupId, undefined, owner.cookie);
    expect(
      await api.gqlFail(member.cookie, SET, { postId: othersPost.id, categoryId: cat.id }),
    ).toMatchObject({ code: 'FORBIDDEN' });
  });
  it('부관리자 강등 직후 생성·이름 변경·보관·정렬을 모두 거부해야 한다', async () => {
    const groupId = await group();
    const cat = await category(groupId);
    await api.gqlOk(
      owner.cookie,
      'mutation($g:ID!,$u:ID!){setGroupModerator(groupId:$g,userId:$u,enabled:false){id}}',
      { g: groupId, u: moderator.id },
    );
    for (const [query, variables] of [
      [CREATE, { groupId, name: '새 분류' }],
      [RENAME, { categoryId: cat.id, name: '변경' }],
      [ARCHIVE, { id: cat.id }],
      [REORDER, { groupId, ids: [cat.id] }],
    ] as const)
      expect(await api.gqlFail(moderator.cookie, query, variables)).toMatchObject({ code: 'FORBIDDEN' });
  });
  it('카테고리별 피드와 미분류를 구분하고 기존 통합 피드에는 라벨만 추가해야 한다', async () => {
    const groupId = await group();
    const cat = await category(groupId);
    const post = await createPost(groupId, cat.id);
    await createPost(groupId);
    const result = await api.gqlOk<{ galleryPosts: IPost[] }>(
      member.cookie,
      'query($groupId:ID!,$categoryId:ID!){galleryPosts(groupId:$groupId,categoryId:$categoryId){id category{id name}}}',
      { groupId, categoryId: cat.id },
    );
    expect(result.galleryPosts).toEqual([{ id: post.id, category: { id: cat.id, name: cat.name } }]);
  });
  it('대회 참여 글에도 카테고리를 지정할 수 있어야 한다', async () => {
    const groupId = await group();
    const cat = await category(groupId);
    const now = Date.now();
    const { createGroupContest: contest } = await api.gqlOk<{ createGroupContest: { id: string } }>(
      owner.cookie,
      'mutation($g:ID!,$start:DateTime!,$close:DateTime!,$end:DateTime!){createGroupContest(groupId:$g,title:"분류 대회",startsAt:$start,submissionEndsAt:$close,endsAt:$end){id}}',
      {
        g: groupId,
        start: new Date(now).toISOString(),
        close: new Date(now + 3600000).toISOString(),
        end: new Date(now + 7200000).toISOString(),
      },
    );
    expect(
      (
        await api.gqlOk<{ createPost: IPost }>(member.cookie, POST, {
          groupId,
          categoryId: cat.id,
          contestId: contest.id,
        })
      ).createPost.category,
    ).toMatchObject({ id: cat.id });
  });
});
