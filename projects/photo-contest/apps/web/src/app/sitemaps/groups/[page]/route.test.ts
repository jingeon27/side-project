import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getPublicGroupCount, getPublicGroupSitemapPage } from '@/_pages/group';

import { GET } from './route';

// 공개 API 조회만 대신한다. 라우트의 범위 판단과 응답은 실제 코드로 확인한다.
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('@/_pages/group', () => ({
  PUBLIC_GROUP_SITEMAP_SIZE: 48,
  getPublicGroupCount: vi.fn(),
  getPublicGroupSitemapPage: vi.fn(),
}));

const request = (page: string) =>
  GET(new Request(`http://localhost:3200/sitemaps/groups/${page}`), { params: Promise.resolve({ page }) });

beforeEach(() => {
  vi.mocked(getPublicGroupCount).mockReset().mockResolvedValue(49);
  vi.mocked(getPublicGroupSitemapPage)
    .mockReset()
    .mockResolvedValue([{ __typename: 'Group', id: 'group-1' }] as never);
});

describe('공개 그룹 사이트맵 분할 파일', () => {
  it('실제 페이지 수 안의 번호만 조회해야 한다', async () => {
    const last = await request('1.xml');
    expect(last.status).toBe(200);
    expect(await last.text()).toContain('/groups/group-1');
    expect(getPublicGroupSitemapPage).toHaveBeenCalledWith(1);
  });

  it('범위 밖 번호는 페이지를 조회하지 않고 404여야 한다', async () => {
    for (const page of ['2.xml', '999999999.xml']) expect((await request(page)).status).toBe(404);
    expect(getPublicGroupSitemapPage).not.toHaveBeenCalled();
  });

  it('형식이 틀린 이름은 개수도 조회하지 않고 404여야 한다', async () => {
    for (const page of ['invalid.xml', '01.xml', '1', '-1.xml', '9999999999999.xml'])
      expect((await request(page)).status).toBe(404);
    expect(getPublicGroupCount).not.toHaveBeenCalled();
    expect(getPublicGroupSitemapPage).not.toHaveBeenCalled();
  });

  it('공개 그룹이 없으면 첫 페이지도 404여야 한다', async () => {
    vi.mocked(getPublicGroupCount).mockResolvedValue(0);
    expect((await request('0.xml')).status).toBe(404);
    expect(getPublicGroupSitemapPage).not.toHaveBeenCalled();
  });
});
