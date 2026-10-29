import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { minutesFrom, moveContestTo, setSubmittedAt } from '../../test/support/clock';
import {
  createContest,
  createGroup,
  hidePhoto,
  joinGroup,
  likePhoto,
  type ITestGroup,
} from '../../test/support/fixtures';
import { submitPhoto } from '../../test/support/photos';

const FEED = `query($offset: Int, $limit: Int) {
  myPhotoFeed(offset: $offset, limit: $limit) {
    id groupId groupName contestTitle phase
    submission { id caption hidden voteCount likeCount likedByMe reportCount reports { id reason } }
  }
}`;
interface IFeedItem {
  id: string;
  groupId: string;
  groupName: string;
  contestTitle: string;
  phase: string;
  submission: {
    id: string;
    caption: string;
    hidden: boolean;
    voteCount: number | null;
    likeCount: number;
    likedByMe: boolean;
    reportCount: number | null;
    reports: unknown;
  };
}

describe('모든 내 그룹의 사진 피드', () => {
  let api: ITestApi, viewer: ITestUser, friend: ITestUser;
  let groupA: ITestGroup, groupB: ITestGroup;
  let older: string, newer: string, past: string;
  const base = new Date(Date.now() - 3_600_000);
  const list = async (cookie: string | undefined, variables: Record<string, unknown> = {}) =>
    (await api.gqlOk<{ myPhotoFeed: IFeedItem[] }>(cookie, FEED, variables)).myPhotoFeed;

  beforeAll(async () => {
    api = await createTestApp();
    viewer = await api.signIn('피드-조회자');
    friend = await api.signIn('피드-친구');
    const outsider = await api.signIn('피드-외부인');
    groupA = await createGroup(api, viewer, '피드 첫 그룹', [friend]);
    groupB = await createGroup(api, friend, '피드 두 번째 그룹', [viewer]);
    const otherGroup = await createGroup(api, outsider, '피드 비가입 그룹');
    const a = await createContest(api, viewer, groupA.id, '첫 그룹 대회');
    const b = await createContest(api, friend, groupB.id, '두 번째 그룹 대회');
    const completed = await createContest(api, viewer, groupA.id, '지난 대회');
    const other = await createContest(api, outsider, otherGroup.id, '비가입 대회');
    older = await submitPhoto(api, viewer, a, '첫 그룹 사진');
    newer = await submitPhoto(api, friend, b, '두 번째 그룹 사진');
    past = await submitPhoto(api, viewer, completed, '지난 대회 사진');
    const hidden = await submitPhoto(api, friend, a, '숨긴 사진');
    await submitPhoto(api, outsider, other, '절대 노출되면 안 되는 사진');
    await setSubmittedAt(api, past, base);
    await setSubmittedAt(api, older, minutesFrom(base, 1));
    await setSubmittedAt(api, newer, minutesFrom(base, 2));
    await hidePhoto(api, viewer, hidden);
    await likePhoto(api, newer, [viewer]);
    await moveContestTo(api, completed, 'COMPLETED');
  });
  afterAll(async () => {
    await api?.close();
  });

  it('가입한 모든 그룹과 지난 대회의 공개 사진을 전체 최신순으로 모아야 한다', async () => {
    const rows = await list(viewer.cookie);
    expect(rows.map(({ id }) => id)).toEqual([newer, older, past]);
    expect(rows[0]).toMatchObject({
      groupId: groupB.id,
      groupName: '피드 두 번째 그룹',
      contestTitle: '두 번째 그룹 대회',
      submission: { likedByMe: true, likeCount: 1, voteCount: null },
    });
    expect(rows[2]).toMatchObject({ phase: 'COMPLETED', submission: { voteCount: 0 } });
    expect(
      rows.every(
        ({ submission }) =>
          !submission.hidden && submission.reports === null && submission.reportCount === null,
      ),
    ).toBe(true);
  });

  it('그룹별 개수와 관계없이 전체 피드를 offset과 limit으로 나눠야 한다', async () => {
    expect((await list(viewer.cookie, { offset: 0, limit: 2 })).map(({ id }) => id)).toEqual([newer, older]);
    expect((await list(viewer.cookie, { offset: 2, limit: 2 })).map(({ id }) => id)).toEqual([past]);
    expect(await list(viewer.cookie, { offset: 3, limit: 2 })).toEqual([]);
    expect((await list(viewer.cookie, { offset: null, limit: null })).map(({ id }) => id)).toEqual([
      newer,
      older,
      past,
    ]);
  });

  it('제출 시각이 같아도 id 최신순으로 안정적으로 페이지를 나눠야 한다', async () => {
    await setSubmittedAt(api, newer, minutesFrom(base, 1));
    try {
      const expected = [newer, older].sort().reverse();
      const first = await list(viewer.cookie, { limit: 1 });
      const second = await list(viewer.cookie, { offset: 1, limit: 1 });
      expect([...first, ...second].map(({ id }) => id)).toEqual(expected);
    } finally {
      await setSubmittedAt(api, newer, minutesFrom(base, 2));
    }
  });

  it('로그인하지 않으면 거부하고 가입한 그룹이 없으면 빈 목록이어야 한다', async () => {
    expect((await api.gqlFail(undefined, FEED)).code).toBe('UNAUTHENTICATED');
    expect(await list((await api.signIn('피드-빈 사용자')).cookie)).toEqual([]);
  });

  it('올바르지 않은 페이지 범위는 거부해야 한다', async () => {
    for (const range of [{ offset: -1 }, { limit: 0 }, { limit: 49 }, { offset: 1.5 }])
      expect((await api.gqlFail(viewer.cookie, FEED, range)).code).toBe('BAD_USER_INPUT');
  });

  it('멤버십이 사라진 그룹의 사진은 다음 요청부터 제외해야 한다', async () => {
    await api.db.groupMember.delete({ where: { groupId_userId: { groupId: groupB.id, userId: viewer.id } } });
    try {
      expect((await list(viewer.cookie)).map(({ id }) => id)).toEqual([older, past]);
    } finally {
      await joinGroup(api, viewer, groupB.inviteToken);
    }
  });
});
