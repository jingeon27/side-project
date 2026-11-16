import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../../test/support/app';
import { createContest, createGroup } from '../../../test/support/fixtures';
import { createGroupContest } from '../../../test/support/group-contest';

const POST = 'query($id:ID!){galleryPost(id:$id){id}}';
const LIKE = 'mutation($id:ID!){likePost(postId:$id){id}}';
const HIDE = 'mutation($id:ID!){setPostHidden(postId:$id,hidden:true)}';
const GROUP_CONTEST = 'query($id:ID!){groupContest(id:$id){id}}';
const LEGACY_CONTEST = 'query($id:ID!){contest(id:$id){id}}';

describe('MembershipService 존재 여부 회귀', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let outsider: ITestUser;
  let postId: string;
  let groupContestId: string;
  let legacyContestId: string;
  let publicPostId: string;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('존재숨김-그룹장');
    outsider = await api.signIn('존재숨김-외부인');
    const privateGroup = await createGroup(api, owner, '존재 숨김 비공개', [], 'PRIVATE');
    const publicGroup = await createGroup(api, owner, '존재 숨김 공개');
    const create = async (groupId: string) =>
      (
        await api.gqlOk<{ createPost: { id: string } }>(
          owner.cookie,
          'mutation($id:ID!){createPost(groupId:$id,title:"존재 숨김",linkUrl:"https://example.com",rightsConfirmed:true){id}}',
          { id: groupId },
        )
      ).createPost.id;
    postId = await create(privateGroup.id);
    publicPostId = await create(publicGroup.id);
    groupContestId = await createGroupContest(api, owner, privateGroup.id);
    legacyContestId = await createContest(api, owner, publicGroup.id, '존재 숨김 기존 대회');
  });

  afterAll(async () => {
    await api?.close();
  });

  it('비공개 그룹의 게시물·대회와 기존 대회는 비멤버에게 없는 ID와 같은 오류여야 한다', async () => {
    // 없는 ID는 NOT_FOUND, 있는 비공개 ID는 FORBIDDEN·UNAUTHENTICATED라 ID가 있는지 구분할 수 있었다.
    const cases: Array<[string | undefined, string, string]> = [
      [undefined, POST, postId],
      [outsider.cookie, POST, postId],
      [outsider.cookie, LIKE, postId],
      [outsider.cookie, HIDE, postId],
      [undefined, GROUP_CONTEST, groupContestId],
      [outsider.cookie, GROUP_CONTEST, groupContestId],
      [outsider.cookie, LEGACY_CONTEST, legacyContestId],
    ];
    for (const [cookie, query, id] of cases) {
      const existing = await api.gqlFail(cookie, query, { id });
      expect(existing.code, query).toBe('NOT_FOUND');
      expect(existing, query).toEqual(await api.gqlFail(cookie, query, { id: `missing-${id}` }));
    }
  });

  it('공개 그룹의 게시물은 누구나 보므로 비멤버의 쓰기는 가입이 필요하다고 알려야 한다', async () => {
    expect(await api.gqlOk(undefined, POST, { id: publicPostId })).toEqual({
      galleryPost: { id: publicPostId },
    });
    expect(await api.gqlFail(outsider.cookie, LIKE, { id: publicPostId })).toEqual({
      code: 'FORBIDDEN',
      message: '이 그룹에 접근할 권한이 없습니다.',
    });
  });
});
