import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type ITestApi, type ITestUser } from '../../test/support/app';
import { createGroup } from '../../test/support/fixtures';

const SITEMAP = '{publicGroupSitemap(limit:48){id lastModifiedAt}}';

interface ISitemapEntry {
  id: string;
  lastModifiedAt: string;
}

describe('공개 그룹 사이트맵 수정 시각', () => {
  let api: ITestApi;
  let owner: ITestUser;

  beforeAll(async () => {
    api = await createTestApp();
    owner = await api.signIn('사이트맵-그룹장');
  });

  afterAll(async () => {
    await api?.close();
  });

  const post = (groupId: string, createdAt: string, hidden = false) =>
    api.db.post.create({
      data: {
        groupId,
        authorId: owner.id,
        title: '사이트맵 게시물',
        linkUrl: 'https://example.com/post',
        createdAt: new Date(createdAt),
        hidden,
      },
    });
  const entries = async () =>
    (await api.gqlOk<{ publicGroupSitemap: ISitemapEntry[] }>(undefined, SITEMAP)).publicGroupSitemap;

  it('마지막 공개 게시물 시각을 쓰고 숨긴 게시물은 세지 않아야 한다', async () => {
    const { id } = await createGroup(api, owner, '사이트맵 게시물 그룹');
    await post(id, '2030-01-01T00:00:00.000Z');
    await post(id, '2030-02-01T00:00:00.000Z');
    await post(id, '2030-03-01T00:00:00.000Z', true);

    expect((await entries()).find((entry) => entry.id === id)?.lastModifiedAt).toBe(
      '2030-02-01T00:00:00.000Z',
    );
  });

  it('게시물이 없으면 그룹 생성 시각을 써야 한다', async () => {
    const { id } = await createGroup(api, owner, '사이트맵 빈 그룹');
    const { createdAt } = await api.db.group.findUniqueOrThrow({ where: { id } });

    expect((await entries()).find((entry) => entry.id === id)?.lastModifiedAt).toBe(createdAt.toISOString());
  });

  it('비공개 그룹과 그 활동 시각은 익명 응답에 없어야 한다', async () => {
    const { id } = await createGroup(api, owner, '사이트맵 비공개 그룹', [], 'PRIVATE');
    await post(id, '2030-04-01T00:00:00.000Z');

    const result = await entries();
    expect(result.some((entry) => entry.id === id)).toBe(false);
    expect(result.some((entry) => entry.lastModifiedAt === '2030-04-01T00:00:00.000Z')).toBe(false);
  });
});
