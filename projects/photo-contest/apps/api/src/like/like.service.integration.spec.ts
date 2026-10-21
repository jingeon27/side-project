import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { moveContestTo } from '../../test/support/clock';
import { createContest, createGroup, joinGroup, type ITestGroup } from '../../test/support/fixtures';
import { listPhotos, submitPhoto } from '../../test/support/photos';

const LIKE = 'mutation($id: ID!) { likeSubmission(submissionId: $id) { id likeCount likedByMe } }';
const UNLIKE = 'mutation($id: ID!) { unlikeSubmission(submissionId: $id) { id likeCount likedByMe } }';
const PHOTO_NOT_FOUND = { code: 'NOT_FOUND', message: '사진을 찾을 수 없습니다.' };

interface ILikeState {
  id: string;
  likeCount: number;
  likedByMe: boolean;
}

describe('좋아요', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let author: ITestUser;
  let fan: ITestUser;
  let friend: ITestUser;
  let outsider: ITestUser;
  let group: ITestGroup;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('좋아요-관리자');
    author = await api.signIn('좋아요-작가');
    fan = await api.signIn('좋아요-팬');
    friend = await api.signIn('좋아요-친구');
    outsider = await api.signIn('좋아요-외부인');
    group = await createGroup(api, owner, '좋아요 그룹', [author, fan, friend]);
  });

  afterAll(async () => {
    await api?.close();
  });

  /** 작가의 사진 한 장이 있는 새 대회 */
  async function photoOfAuthor(title: string) {
    const contestId = await createContest(api, owner, group.id, title);
    const photoId = await submitPhoto(api, author, contestId, `${title} 사진`);
    return { contestId, photoId };
  }

  async function like(user: ITestUser, photoId: string) {
    return (await api.gqlOk<{ likeSubmission: ILikeState }>(user.cookie, LIKE, { id: photoId }))
      .likeSubmission;
  }

  async function unlike(user: ITestUser, photoId: string) {
    return (await api.gqlOk<{ unlikeSubmission: ILikeState }>(user.cookie, UNLIKE, { id: photoId }))
      .unlikeSubmission;
  }

  /** viewer가 목록에서 보는 그 사진의 좋아요 상태 */
  async function listedLike(viewer: ITestUser, contestId: string, photoId: string) {
    const photos = await listPhotos<ILikeState>(api, viewer.cookie, contestId, 'id likeCount likedByMe');
    return photos.find(({ id }) => id === photoId);
  }

  it('그룹 멤버는 남의 사진에 좋아요를 누르고 바뀐 사진을 돌려받아야 한다', async () => {
    const { contestId, photoId } = await photoOfAuthor('좋아요 기본');
    expect(await like(fan, photoId)).toEqual({ id: photoId, likeCount: 1, likedByMe: true });
    expect(await listedLike(fan, contestId, photoId)).toEqual({ id: photoId, likeCount: 1, likedByMe: true });
    expect(await listedLike(friend, contestId, photoId)).toEqual({
      id: photoId,
      likeCount: 1,
      likedByMe: false,
    });
    expect(await listedLike(author, contestId, photoId)).toEqual({
      id: photoId,
      likeCount: 1,
      likedByMe: false,
    });
  });

  it('두 번 눌러도 하나만 남고 누르지 않은 사진을 취소하면 그대로여야 한다', async () => {
    const { photoId } = await photoOfAuthor('좋아요 멱등');
    await like(fan, photoId);
    expect(await like(fan, photoId)).toEqual({ id: photoId, likeCount: 1, likedByMe: true });
    expect(await api.db.like.count({ where: { submissionId: photoId } })).toBe(1);

    expect(await unlike(fan, photoId)).toEqual({ id: photoId, likeCount: 0, likedByMe: false });
    expect(await unlike(fan, photoId)).toEqual({ id: photoId, likeCount: 0, likedByMe: false });
    await like(friend, photoId);
    // 자기 사진은 누를 수 없으니 취소도 아무 일 없이 사진만 돌려준다.
    expect(await unlike(author, photoId)).toEqual({ id: photoId, likeCount: 1, likedByMe: false });
  });

  it('자기 사진에는 좋아요를 누를 수 없어야 한다', async () => {
    const { photoId } = await photoOfAuthor('자기 사진 좋아요');
    expect(await api.gqlFail(author.cookie, LIKE, { id: photoId })).toEqual({
      code: 'BAD_USER_INPUT',
      message: '자신의 사진에는 좋아요를 누를 수 없습니다.',
    });
    expect(await api.db.like.count({ where: { submissionId: photoId } })).toBe(0);
  });

  it('비회원은 FORBIDDEN, 없는 사진은 NOT_FOUND여야 한다', async () => {
    const { photoId } = await photoOfAuthor('비회원 좋아요');
    const forbidden = { code: 'FORBIDDEN', message: '이 그룹에 접근할 권한이 없습니다.' };
    expect(await api.gqlFail(outsider.cookie, LIKE, { id: photoId })).toEqual(forbidden);
    expect(await api.gqlFail(outsider.cookie, UNLIKE, { id: photoId })).toEqual(forbidden);
    expect(await api.gqlFail(fan.cookie, LIKE, { id: 'missing-photo' })).toEqual(PHOTO_NOT_FOUND);
  });

  it('숨긴 사진은 관리자가 아니면 NOT_FOUND이고 관리자는 누를 수 있어야 한다', async () => {
    const { photoId } = await photoOfAuthor('숨긴 사진 좋아요');
    await like(friend, photoId);
    await api.gqlOk(owner.cookie, 'mutation($id: ID!) { hideSubmission(submissionId: $id) }', {
      id: photoId,
    });

    expect(await api.gqlFail(fan.cookie, LIKE, { id: photoId })).toEqual(PHOTO_NOT_FOUND);
    expect(await api.gqlFail(friend.cookie, UNLIKE, { id: photoId })).toEqual(PHOTO_NOT_FOUND);
    expect(await like(owner, photoId)).toEqual({ id: photoId, likeCount: 2, likedByMe: true });
  });

  it('제출·투표·종료 모든 단계에서 누를 수 있고 좋아요 수는 늘 공개해야 한다', async () => {
    const { contestId, photoId } = await photoOfAuthor('단계별 좋아요');
    const likers: Array<['SUBMISSION' | 'VOTING' | 'COMPLETED', ITestUser]> = [
      ['SUBMISSION', fan],
      ['VOTING', friend],
      ['COMPLETED', owner],
    ];
    for (const [index, [phase, liker]] of likers.entries()) {
      await moveContestTo(api, contestId, phase);
      expect(await like(liker, photoId), phase).toMatchObject({ likeCount: index + 1, likedByMe: true });
      expect((await listedLike(author, contestId, photoId))?.likeCount, phase).toBe(index + 1);
    }
  });

  it('같은 사람이 동시에 여러 번 눌러도 좋아요와 이벤트는 하나만 남아야 한다', async () => {
    const { photoId } = await photoOfAuthor('동시 좋아요');
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        api.gql<{ likeSubmission: ILikeState }>(fan.cookie, LIKE, { id: photoId }),
      ),
    );
    for (const result of results) {
      expect(result.errors).toBeUndefined();
      expect(result.data?.likeSubmission).toEqual({ id: photoId, likeCount: 1, likedByMe: true });
    }
    expect(await api.db.like.count({ where: { submissionId: photoId } })).toBe(1);
    expect(await api.db.analyticsEvent.count({ where: { id: `like:${photoId}:${fan.id}` } })).toBe(1);
  });

  it('여러 사람이 동시에 누르고 취소해도 좋아요 수는 Like 행 수와 같아야 한다', async () => {
    const { contestId, photoId } = await photoOfAuthor('여럿 동시 좋아요');
    const crowd = [fan, friend, owner];
    for (const nickname of ['좋아요-군중1', '좋아요-군중2', '좋아요-군중3']) {
      const user = await api.signIn(nickname);
      await joinGroup(api, user, group.inviteToken);
      crowd.push(user);
    }
    const rowsOfPhoto = () => api.db.like.count({ where: { submissionId: photoId } });

    await Promise.all(crowd.map((user) => like(user, photoId)));
    expect(await rowsOfPhoto()).toBe(crowd.length);
    expect((await listedLike(author, contestId, photoId))?.likeCount).toBe(crowd.length);

    // 절반은 두 번씩 동시에 취소하고, 나머지 절반은 그 사이 다시 누른다. 결과는 어느 순서로 끝나도 같다.
    const leaving = crowd.slice(0, 3);
    const staying = crowd.slice(3);
    await Promise.all([
      ...leaving.flatMap((user) => [unlike(user, photoId), unlike(user, photoId)]),
      ...staying.map((user) => like(user, photoId)),
    ]);
    expect(await rowsOfPhoto()).toBe(staying.length);
    expect(await listedLike(author, contestId, photoId)).toEqual({
      id: photoId,
      likeCount: staying.length,
      likedByMe: false,
    });
    for (const user of crowd)
      expect((await listedLike(user, contestId, photoId))?.likedByMe, user.nickname).toBe(
        staying.includes(user),
      );
  });

  it('처음 누른 좋아요만 submission_liked 이벤트로 남기고 취소는 이벤트를 남기지 않아야 한다', async () => {
    const { contestId, photoId } = await photoOfAuthor('좋아요 이벤트');
    const eventsOfFan = () =>
      api.db.analyticsEvent.findMany({
        where: {
          type: 'submission_liked',
          userId: fan.id,
          properties: { path: ['submissionId'], equals: photoId },
        },
      });

    await like(fan, photoId);
    expect(await eventsOfFan()).toEqual([
      expect.objectContaining({
        id: `like:${photoId}:${fan.id}`,
        type: 'submission_liked',
        userId: fan.id,
        properties: { submissionId: photoId, contestId, groupId: group.id },
      }),
    ]);
    const eventCount = await api.db.analyticsEvent.count();
    await unlike(fan, photoId);
    expect(await api.db.analyticsEvent.count()).toBe(eventCount);
    await like(fan, photoId);
    expect(await eventsOfFan()).toHaveLength(1);
  });

  it('사진을 지우면 그 사진의 좋아요도 함께 지워야 한다', async () => {
    const { photoId } = await photoOfAuthor('삭제 좋아요');
    await like(fan, photoId);
    await like(friend, photoId);
    await api.gqlOk(owner.cookie, 'mutation($id: ID!) { deleteSubmission(submissionId: $id) }', {
      id: photoId,
    });
    expect(await api.db.like.count({ where: { submissionId: photoId } })).toBe(0);
    expect(await api.gqlFail(fan.cookie, LIKE, { id: photoId })).toEqual(PHOTO_NOT_FOUND);
  });
});
