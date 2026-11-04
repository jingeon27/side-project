import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getPublicGroupContestCount,
  getPublicGroupContestSitemapPage,
} from '@/_pages/group-contests/index.server';

import { GET } from './route';

// 공개 API 조회만 대신한다. 라우트의 범위 판단과 응답은 실제 코드로 확인한다.
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('@/_pages/group-contests/index.server', () => ({
  PUBLIC_CONTEST_SITEMAP_SIZE: 48,
  getPublicGroupContestCount: vi.fn(),
  getPublicGroupContestSitemapPage: vi.fn(),
}));

const request = (page: string) =>
  GET(new Request(`http://localhost:3200/sitemaps/contests/${page}`), { params: Promise.resolve({ page }) });

beforeEach(() => {
  vi.mocked(getPublicGroupContestCount).mockReset().mockResolvedValue(48);
  vi.mocked(getPublicGroupContestSitemapPage)
    .mockReset()
    .mockResolvedValue([
      { __typename: 'GroupContest', id: 'contest-1', groupId: 'group-1', phase: 'VOTING' },
    ] as never);
});

describe('공개 그룹 대회 사이트맵 분할 파일', () => {
  it('실제 페이지 수 안의 번호만 조회해야 한다', async () => {
    const first = await request('0.xml');
    expect(first.status).toBe(200);
    expect(await first.text()).toContain('/groups/group-1/contests/contest-1');
    expect(getPublicGroupContestSitemapPage).toHaveBeenCalledWith(0);
  });

  it('대회가 보이는 목록 화면만 한 번씩 올리고 빈 목록 화면은 올리지 않아야 한다', async () => {
    vi.mocked(getPublicGroupContestSitemapPage).mockResolvedValue([
      { __typename: 'GroupContest', id: 'ongoing-1', groupId: 'ongoing', phase: 'SUBMISSION' },
      { __typename: 'GroupContest', id: 'ongoing-2', groupId: 'ongoing', phase: 'VOTING' },
      { __typename: 'GroupContest', id: 'ended', groupId: 'finished', phase: 'COMPLETED' },
    ] as never);
    const body = await (await request('0.xml')).text();

    expect(body.match(/\/groups\/ongoing\/contests</g)).toHaveLength(1);
    expect(body).not.toContain('/groups/ongoing/hall-of-fame');
    expect(body.match(/\/groups\/finished\/hall-of-fame</g)).toHaveLength(1);
    expect(body).not.toContain('/groups/finished/contests<');
    for (const path of [
      'ongoing/contests/ongoing-1',
      'ongoing/contests/ongoing-2',
      'finished/contests/ended',
    ])
      expect(body).toContain(`/groups/${path}<`);
  });

  it('범위 밖이거나 형식이 틀린 번호는 페이지를 조회하지 않고 404여야 한다', async () => {
    for (const page of ['1.xml', '9999999999999.xml', 'invalid.xml'])
      expect((await request(page)).status).toBe(404);
    expect(getPublicGroupContestSitemapPage).not.toHaveBeenCalled();
  });
});
