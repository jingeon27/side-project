import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { createContest, createGroup } from '../../test/support/fixtures';
import { storedPhotoExists, submitPhoto } from '../../test/support/photos';
import { MediaStorage } from '../storage/media-storage.service';

const DELETE = 'mutation($id: ID!) { deleteSubmission(submissionId: $id) }';

describe('ModerationService 회귀', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let author: ITestUser;
  let groupId: string;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('삭제회귀-관리자');
    author = await api.signIn('삭제회귀-작가');
    groupId = (await createGroup(api, owner, '삭제 회귀 그룹', [author])).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it('커밋 뒤 파일 삭제가 실패해도 성공을 돌려주고 정리 작업이 파일을 다시 지워야 한다', async () => {
    // 커밋한 뒤 저장소 오류를 그대로 던져 이미 지운 사진에 500이 나갔다.
    const contestId = await createContest(api, owner, groupId, '삭제 회귀 대회');
    const photoId = await submitPhoto(api, author, contestId, '삭제 회귀 사진');
    const upload = await api.db.upload.findFirstOrThrow({ where: { submission: { id: photoId } } });
    const imageKey = upload.imageKey ?? '';
    vi.spyOn(api.app.get(MediaStorage), 'delete').mockRejectedValueOnce(new Error('storage unavailable'));

    const result = await api.gql<{ deleteSubmission: boolean }>(owner.cookie, DELETE, { id: photoId });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({ deleteSubmission: true });
    expect(await api.db.submission.count({ where: { id: photoId } })).toBe(0);
    expect(await storedPhotoExists(api, imageKey)).toBe(true);

    await api.db.upload.update({
      where: { id: upload.id },
      data: { expiresAt: new Date(Date.now() - 6 * 60 * 1000) },
    });
    await api.runScheduledWork();
    expect(await storedPhotoExists(api, imageKey)).toBe(false);
  });
});
