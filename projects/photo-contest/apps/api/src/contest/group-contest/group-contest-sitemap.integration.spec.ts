import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../../test/support/app';
import { createGroup } from '../../../test/support/fixtures';
import { createGroupContest } from '../../../test/support/group-contest';

const SITEMAP = '{publicGroupContests(limit:48){id lastModifiedAt}}';

describe('공개 대회 사이트맵 수정 시각', () => {
  let api: ITestApi;
  let owner: ITestUser;
  let groupId: string;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('대회사이트맵-그룹장');
    groupId = (await createGroup(api, owner, '대회 사이트맵 그룹')).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  /** 시각을 고정해 단계 경계와 참여작 중 어느 값이 쓰였는지 구분한다. */
  const pastContest = async (title: string) => {
    const id = await createGroupContest(api, owner, groupId, title);
    await api.db.contest.update({
      where: { id },
      data: {
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        startsAt: new Date('2026-01-02T00:00:00.000Z'),
        submissionEndsAt: new Date('2026-01-03T00:00:00.000Z'),
        endsAt: new Date('2026-01-04T00:00:00.000Z'),
      },
    });
    return id;
  };
  const entry = (contestId: string, createdAt: string, hidden = false) =>
    api.db.post.create({
      data: {
        groupId,
        contestId,
        authorId: owner.id,
        title: '사이트맵 참여작',
        linkUrl: 'https://example.com/entry',
        createdAt: new Date(createdAt),
        hidden,
      },
    });
  const lastModifiedOf = async (id: string) =>
    (
      await api.gqlOk<{ publicGroupContests: Array<{ id: string; lastModifiedAt: string }> }>(
        undefined,
        SITEMAP,
      )
    ).publicGroupContests.find((contest) => contest.id === id)?.lastModifiedAt;

  it('참여작이 없으면 마지막으로 지나간 단계 경계를 써야 한다', async () => {
    const id = await pastContest('경계 대회');
    expect(await lastModifiedOf(id)).toBe('2026-01-04T00:00:00.000Z');
  });

  it('단계 경계보다 늦은 공개 참여작을 쓰고 숨긴 참여작은 세지 않아야 한다', async () => {
    const id = await pastContest('참여작 대회');
    await entry(id, '2026-01-05T00:00:00.000Z');
    await entry(id, '2026-01-06T00:00:00.000Z', true);
    expect(await lastModifiedOf(id)).toBe('2026-01-05T00:00:00.000Z');
  });

  it('아직 지나지 않은 단계 경계는 미래 시각으로 올리지 않아야 한다', async () => {
    const id = await createGroupContest(api, owner, groupId, '진행 대회');
    const { endsAt } = await api.db.contest.findUniqueOrThrow({ where: { id } });
    const lastModified = await lastModifiedOf(id);

    expect(Date.parse(lastModified ?? '')).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(lastModified ?? '')).toBeLessThan(endsAt.getTime());
  });
});
