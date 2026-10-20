import { createTestUser, graphqlRequest } from '@photo-contest/test-kit';
import { print } from 'graphql';
import { afterEach, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { CreateGroupContestDocument, CreateGroupDocument, GroupVisibility } from '@/shared/api/generated';
import {
  getGroupContestsSeoData,
  getPublicGroupContestCount,
  getPublicGroupContestSitemapPage,
  PUBLIC_CONTEST_SITEMAP_SIZE,
} from './group-contests-seo.server';

const origin = 'http://localhost:3321';
let url: string;
let cookie: string;

describe('대회 목록·명예의 전당 SEO와 사이트맵', () => {
  beforeAll(async () => {
    url = inject('apiUrl');
    cookie = await createTestUser(url, { origin, nickname: '대회 사이트맵 그룹장' });
  });
  beforeEach(() => {
    vi.stubEnv('API_URL', url);
    vi.stubEnv('WEB_ORIGIN', origin);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('48개를 넘는 공개 대회도 빠짐없이 분할하고 비공개 대회는 제외해야 한다', async () => {
    const createGroup = async (visibility: GroupVisibility) => {
      const result = await graphqlRequest<{ createGroup: { id: string } }>(url, {
        cookie,
        origin,
        query: print(CreateGroupDocument),
        variables: { name: `대회 사이트맵 ${visibility}`, visibility },
      });
      if (!result.data) throw new Error(JSON.stringify(result.errors));
      return result.data.createGroup.id;
    };
    const groupId = await createGroup(GroupVisibility.Public);
    const privateId = await createGroup(GroupVisibility.Private);
    const before = await getPublicGroupContestCount();
    const ids: string[] = [];
    let privateContestId = '';
    for (let index = 0; index < PUBLIC_CONTEST_SITEMAP_SIZE + 2; index++) {
      const secret = index === PUBLIC_CONTEST_SITEMAP_SIZE + 1;
      const now = Date.now();
      const result = await graphqlRequest<{ createGroupContest: { id: string } }>(url, {
        cookie,
        origin,
        query: print(CreateGroupContestDocument),
        variables: {
          groupId: secret ? privateId : groupId,
          title: `사이트맵 대회 ${index}`,
          startsAt: new Date(now - 1_000).toISOString(),
          submissionEndsAt: new Date(now + 3_600_000).toISOString(),
          endsAt: new Date(now + 7_200_000).toISOString(),
        },
      });
      if (!result.data) throw new Error(JSON.stringify(result.errors));
      if (secret) {
        privateContestId = result.data.createGroupContest.id;
        continue;
      }
      ids.push(result.data.createGroupContest.id);
    }
    const count = await getPublicGroupContestCount();
    expect(count).toBe(before + ids.length);
    const pages = await Promise.all(
      Array.from({ length: Math.ceil(count / PUBLIC_CONTEST_SITEMAP_SIZE) }, (_, page) =>
        getPublicGroupContestSitemapPage(page),
      ),
    );
    const allIds = pages.flat().map((contest) => contest.id);
    expect(allIds).toHaveLength(count);
    expect(new Set(allIds).size).toBe(count);
    expect(allIds).toEqual(expect.arrayContaining(ids));
    expect(allIds).not.toContain(privateContestId);
    expect((await getGroupContestsSeoData(groupId, false))?.contests).toHaveLength(24);
    expect((await getGroupContestsSeoData(groupId, true))?.contests).toEqual([]);
    expect((await getGroupContestsSeoData(privateId, false))?.contests).toEqual([]);
    expect(await getGroupContestsSeoData('missing-contest-group', true)).toBeNull();
  });
});
