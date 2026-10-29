import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../../test/support/app';
import { createContest, createGroup } from '../../../test/support/fixtures';

const HIDE = 'mutation($id:ID!,$hidden:Boolean!){setPostHidden(postId:$id,hidden:$hidden)}';
const HIDDEN_POSTS = 'query($id:ID!){hiddenGalleryPosts(groupId:$id){id}}';
const POST = 'query($id:ID!){galleryPost(id:$id){id}}';

describe('PostModerationService 회귀', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let groupId: string;
  let postId: string;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('숨김이벤트-그룹장');
    const group = await createGroup(api, owner, '숨김 이벤트 그룹');
    groupId = group.id;
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

  it('기존 사진 숨김으로만 가려진 이관 게시물도 숨김 해제하면 두 행을 함께 풀어야 한다', async () => {
    // Post.hidden만 비교해 이미 풀린 상태로 보고 아무것도 바꾸지 않았다. 숨긴 목록에는 남고 해제할 방법이 없었다.
    const contestId = await createContest(api, owner, groupId, '이관 숨김 대회');
    const upload = await api.db.upload.create({
      data: { tokenHash: randomUUID(), userId: owner.id, contestId, expiresAt: new Date() },
    });
    const submission = await api.db.submission.create({
      data: { contestId, authorId: owner.id, caption: '이관 사진', uploadId: upload.id, hidden: true },
    });
    const migrated = await api.db.post.create({
      data: {
        groupId,
        authorId: owner.id,
        title: '이관 사진',
        linkUrl: 'https://example.com/migrated',
        legacySubmissionId: submission.id,
      },
    });
    const hiddenIds = async () =>
      (
        await api.gqlOk<{ hiddenGalleryPosts: { id: string }[] }>(owner.cookie, HIDDEN_POSTS, { id: groupId })
      ).hiddenGalleryPosts.map(({ id }) => id);
    expect(await hiddenIds()).toContain(migrated.id);
    expect(await api.gqlFail(undefined, POST, { id: migrated.id })).toMatchObject({ code: 'NOT_FOUND' });

    expect(await api.gqlOk(owner.cookie, HIDE, { id: migrated.id, hidden: false })).toEqual({
      setPostHidden: true,
    });
    expect(await api.db.post.findUniqueOrThrow({ where: { id: migrated.id } })).toMatchObject({
      hidden: false,
    });
    expect(await api.db.submission.findUniqueOrThrow({ where: { id: submission.id } })).toMatchObject({
      hidden: false,
    });
    expect(await hiddenIds()).not.toContain(migrated.id);
    expect(await api.gqlOk(undefined, POST, { id: migrated.id })).toEqual({
      galleryPost: { id: migrated.id },
    });
    expect(
      await api.db.analyticsEvent.count({
        where: { type: 'post_visibility_changed', properties: { path: ['postId'], equals: migrated.id } },
      }),
    ).toBe(1);

    // 기존 사진 숨김 경로도 게시물 행을 같은 상태로 맞춘다.
    await api.gqlOk(owner.cookie, 'mutation($id:ID!){hideSubmission(submissionId:$id)}', {
      id: submission.id,
    });
    expect(await api.db.post.findUniqueOrThrow({ where: { id: migrated.id } })).toMatchObject({
      hidden: true,
    });
    expect(await hiddenIds()).toContain(migrated.id);
  });
});
