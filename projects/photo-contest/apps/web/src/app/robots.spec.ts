import { describe, expect, it, vi } from 'vitest';

import robots from './robots';

vi.mock('next/server', () => ({ connection: async () => undefined }));

const readRule = async () => {
  const { rules, sitemap } = await robots();
  const [rule] = [rules].flat();
  return { disallow: [rule?.disallow ?? []].flat(), sitemap };
};

describe('robots.txt', () => {
  it('개인·초대·내부 경로를 막고 사이트맵을 안내해야 한다', async () => {
    const { disallow, sitemap } = await readRule();
    expect(disallow).toEqual(
      expect.arrayContaining(['/me', '/invite/', '/contests/', '/backend/graphql', '/backend/testing/']),
    );
    expect(sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it('사이트맵에 올리는 공개 경로와 noindex를 읽어야 하는 그룹 경로는 막지 않아야 한다', async () => {
    const { disallow } = await readRule();
    const paths = [
      '/',
      '/about',
      '/about/how-it-works',
      '/explore',
      '/groups/group-1',
      '/groups/group-1/contests',
      '/groups/group-1/contests/contest-1',
      '/groups/group-1/hall-of-fame',
      '/og/groups/group-1',
    ];
    for (const path of paths)
      expect(
        disallow.filter((prefix) => path.startsWith(prefix)),
        path,
      ).toEqual([]);
  });
});
