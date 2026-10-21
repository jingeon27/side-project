import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { moveContestTo } from '../../test/support/clock';
import {
  castVote,
  createContest,
  createGroup,
  likePhoto,
  type ITestGroup,
} from '../../test/support/fixtures';
import { listPhotos, storedPhotoExists, submitPhoto } from '../../test/support/photos';

const REPORT =
  'mutation($id: ID!, $reason: String!) { reportSubmission(submissionId: $id, reason: $reason) }';
const HIDE = 'mutation($id: ID!) { hideSubmission(submissionId: $id) }';
const DELETE = 'mutation($id: ID!) { deleteSubmission(submissionId: $id) }';
const RESULTS = `
  query($id: ID!) { contestResults(contestId: $id) { submission { id reportCount reports { reason } } } }
`;
const HIDDEN_SUBMISSIONS = 'query($id: ID!) { contest(id: $id) { hiddenSubmissions { id hidden } } }';
const PHOTO_NOT_FOUND = { code: 'NOT_FOUND', message: '사진을 찾을 수 없습니다.' };
const GROUP_FORBIDDEN = { code: 'FORBIDDEN', message: '이 그룹에 접근할 권한이 없습니다.' };
const INVALID_REASON = { code: 'BAD_USER_INPUT', message: '신고 이유은(는) 1~500자여야 합니다.' };

interface IModeratedSubmission {
  id: string;
  reportCount: number | null;
  reports: Array<{ reason: string }> | null;
}

describe('신고·숨김·삭제', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let author: ITestUser;
  let friend: ITestUser;
  let other: ITestUser;
  let outsider: ITestUser;
  let group: ITestGroup;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('신고-관리자');
    author = await api.signIn('신고-작가');
    friend = await api.signIn('신고-친구');
    other = await api.signIn('신고-이웃');
    outsider = await api.signIn('신고-외부인');
    group = await createGroup(api, owner, '신고 그룹', [author, friend, other]);
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

  function report(user: ITestUser, photoId: string, reason: string) {
    return api.gqlOk<{ reportSubmission: boolean }>(user.cookie, REPORT, { id: photoId, reason });
  }

  function getPhoto(photoId: string, cookie: string) {
    return api.http().get(`/photos/${photoId}`).set('Cookie', cookie);
  }

  function listed(viewer: ITestUser, contestId: string) {
    return listPhotos<IModeratedSubmission>(
      api,
      viewer.cookie,
      contestId,
      'id reportCount reports { reason }',
    );
  }

  it('신고는 중복되지 않고 관리자만 숨김·삭제할 수 있어야 한다', async () => {
    const { contestId, photoId } = await photoOfAuthor('신고 기본');
    await submitPhoto(api, other, contestId, '이웃 사진');
    expect(await report(friend, photoId, '동의하지 않은 사진')).toEqual({ reportSubmission: true });
    expect(await report(friend, photoId, '동의하지 않은 사진')).toEqual({ reportSubmission: true });
    await moveContestTo(api, contestId, 'COMPLETED');

    const adminView = await api.gqlOk<{ contestResults: Array<{ submission: IModeratedSubmission }> }>(
      owner.cookie,
      RESULTS,
      { id: contestId },
    );
    expect(adminView.contestResults.find((result) => result.submission.id === photoId)?.submission).toEqual({
      id: photoId,
      reportCount: 1,
      reports: [{ reason: '동의하지 않은 사진' }],
    });
    const memberView = await api.gqlOk<{ contestResults: Array<{ submission: IModeratedSubmission }> }>(
      friend.cookie,
      RESULTS,
      { id: contestId },
    );
    for (const { submission } of memberView.contestResults) {
      expect(submission.reportCount).toBeNull();
      expect(submission.reports).toBeNull();
    }

    expect(await api.gqlFail(friend.cookie, HIDE, { id: photoId })).toEqual(GROUP_FORBIDDEN);
    expect(await api.gqlOk(owner.cookie, HIDE, { id: photoId })).toEqual({ hideSubmission: true });
    const hiddenPhoto = await getPhoto(photoId, friend.cookie);
    expect(hiddenPhoto.status).toBe(404);
    expect(hiddenPhoto.body).toEqual({ message: PHOTO_NOT_FOUND.message });
    const afterHide = await api.gqlOk<{ contestResults: unknown[] }>(friend.cookie, RESULTS, {
      id: contestId,
    });
    expect(afterHide.contestResults).toHaveLength(1);

    expect(await api.gqlFail(friend.cookie, DELETE, { id: photoId })).toEqual(GROUP_FORBIDDEN);
    expect(await api.gqlOk(owner.cookie, DELETE, { id: photoId })).toEqual({ deleteSubmission: true });
    expect(await api.db.submission.count({ where: { id: photoId } })).toBe(0);
  });

  it('같은 사람이 다시 신고하면 처음 이유가 남고 다른 사람의 신고는 따로 남아야 한다', async () => {
    const { contestId, photoId } = await photoOfAuthor('신고 이유');
    await report(friend, photoId, '처음 이유');
    await report(friend, photoId, '바꾼 이유');
    await report(other, photoId, '이웃의 이유');

    const reports = await api.db.report.findMany({
      where: { submissionId: photoId },
      select: { reporterId: true, reason: true },
    });
    expect(reports).toHaveLength(2);
    expect(reports).toEqual(
      expect.arrayContaining([
        { reporterId: friend.id, reason: '처음 이유' },
        { reporterId: other.id, reason: '이웃의 이유' },
      ]),
    );
    expect((await listed(owner, contestId)).find(({ id }) => id === photoId)).toEqual({
      id: photoId,
      reportCount: 2,
      reports: [{ reason: '처음 이유' }, { reason: '이웃의 이유' }],
    });
  });

  it('신고 이유는 앞뒤 공백을 지우고 1~500자여야 한다', async () => {
    const { photoId } = await photoOfAuthor('신고 이유 검사');
    for (const reason of ['', '   ', 'x'.repeat(501)])
      expect(await api.gqlFail(friend.cookie, REPORT, { id: photoId, reason }), `${reason.length}자`).toEqual(
        INVALID_REASON,
      );
    expect(await api.db.report.count({ where: { submissionId: photoId } })).toBe(0);

    await report(friend, photoId, '  앞뒤 공백  ');
    await report(other, photoId, '가'.repeat(500));
    const reasons = await api.db.report.findMany({
      where: { submissionId: photoId },
      select: { reason: true },
    });
    expect(reasons.map(({ reason }) => reason).sort()).toEqual(['가'.repeat(500), '앞뒤 공백'].sort());
  });

  it('숨긴 사진은 관리자도 신고할 수 없고 비회원은 신고·숨김·삭제할 수 없어야 한다', async () => {
    const { photoId } = await photoOfAuthor('신고 권한');
    for (const mutation of [REPORT, HIDE, DELETE]) {
      expect(await api.gqlFail(outsider.cookie, mutation, { id: photoId, reason: '외부 신고' })).toEqual(
        GROUP_FORBIDDEN,
      );
      expect(await api.gqlFail(owner.cookie, mutation, { id: 'missing-photo', reason: '없는 사진' })).toEqual(
        PHOTO_NOT_FOUND,
      );
    }

    await api.gqlOk(owner.cookie, HIDE, { id: photoId });
    for (const user of [friend, owner])
      expect(
        await api.gqlFail(user.cookie, REPORT, { id: photoId, reason: '숨긴 뒤 신고' }),
        user.nickname,
      ).toEqual(PHOTO_NOT_FOUND);
    expect(await api.db.report.count({ where: { submissionId: photoId } })).toBe(0);
  });

  it('숨겨도 투표·좋아요·신고와 파일은 남기고 관리자에게만 보여야 한다', async () => {
    const { contestId, photoId } = await photoOfAuthor('숨김 보존');
    await likePhoto(api, photoId, [friend]);
    await report(other, photoId, '숨겨 주세요');
    await moveContestTo(api, contestId, 'VOTING');
    await castVote(api, friend, contestId, photoId);
    const upload = await api.db.upload.findFirstOrThrow({ where: { submission: { id: photoId } } });

    expect(await api.gqlOk(owner.cookie, HIDE, { id: photoId })).toEqual({ hideSubmission: true });
    // 이미 숨긴 사진을 다시 숨겨도 같은 결과다.
    expect(await api.gqlOk(owner.cookie, HIDE, { id: photoId })).toEqual({ hideSubmission: true });

    expect(await api.db.vote.count({ where: { submissionId: photoId } })).toBe(1);
    expect(await api.db.like.count({ where: { submissionId: photoId } })).toBe(1);
    expect(await api.db.report.count({ where: { submissionId: photoId } })).toBe(1);
    expect(await storedPhotoExists(api, upload.imageKey ?? '')).toBe(true);

    expect((await getPhoto(photoId, owner.cookie)).status).toBe(200);
    expect((await getPhoto(photoId, author.cookie)).status).toBe(404);
    expect((await listed(friend, contestId)).map(({ id }) => id)).not.toContain(photoId);
    expect(await api.gqlOk(owner.cookie, HIDDEN_SUBMISSIONS, { id: contestId })).toEqual({
      contest: { hiddenSubmissions: [{ id: photoId, hidden: true }] },
    });
    expect(await api.gqlOk(friend.cookie, HIDDEN_SUBMISSIONS, { id: contestId })).toEqual({
      contest: { hiddenSubmissions: [] },
    });
  });

  it('삭제하면 투표·좋아요·신고와 사진 파일을 지우고 업로드는 정리 대상으로 남겨야 한다', async () => {
    const { contestId, photoId } = await photoOfAuthor('삭제');
    await likePhoto(api, photoId, [friend, other]);
    await report(other, photoId, '지워 주세요');
    await moveContestTo(api, contestId, 'VOTING');
    await castVote(api, friend, contestId, photoId);
    const upload = await api.db.upload.findFirstOrThrow({ where: { submission: { id: photoId } } });
    const imageKey = upload.imageKey ?? '';
    expect(await storedPhotoExists(api, imageKey)).toBe(true);

    expect(await api.gqlOk(owner.cookie, DELETE, { id: photoId })).toEqual({ deleteSubmission: true });
    expect(await api.db.submission.count({ where: { id: photoId } })).toBe(0);
    expect(await api.db.vote.count({ where: { submissionId: photoId } })).toBe(0);
    expect(await api.db.like.count({ where: { submissionId: photoId } })).toBe(0);
    expect(await api.db.report.count({ where: { submissionId: photoId } })).toBe(0);
    expect(await storedPhotoExists(api, imageKey)).toBe(false);
    expect((await getPhoto(photoId, owner.cookie)).status).toBe(404);
    expect(await api.gqlFail(owner.cookie, DELETE, { id: photoId })).toEqual(PHOTO_NOT_FOUND);

    // 업로드 행은 바로 만료시켜 두고, 정리 작업이 유예 시간이 지난 뒤 지운다.
    const expired = await api.db.upload.findUniqueOrThrow({ where: { id: upload.id } });
    expect(expired.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    await api.db.upload.update({
      where: { id: upload.id },
      data: { expiresAt: new Date(Date.now() - 6 * 60 * 1000) },
    });
    await api.runScheduledWork();
    expect(await api.db.upload.count({ where: { id: upload.id } })).toBe(0);
  });
});
