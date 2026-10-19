import 'server-only';

import { cache } from 'react';
import {
  GroupContestFilter,
  GroupContestsDocument,
  GroupVisibility,
  PublicGroupSeoDocument,
  PublicGroupContestCountDocument,
  PublicGroupContestSitemapDocument,
} from '@/shared/api/generated';
import { publicQuery, PublicQueryError } from '@/shared/api/public-query.server';
import { getWebOrigin } from '@/shared/api/server-request.helper';
import { groupContestsMetadata, type IGroupContestsSeoData } from './group-contests-seo.helper';

export const PUBLIC_CONTEST_SITEMAP_SIZE = 48;

export const getGroupContestsSeoData = cache(
  async (groupId: string, hallOfFame: boolean): Promise<IGroupContestsSeoData | null> => {
    try {
      const { group } = await publicQuery(PublicGroupSeoDocument, { id: groupId });
      if (group.visibility !== GroupVisibility.Public) return { group, contests: [] };
      const { groupContests } = await publicQuery(GroupContestsDocument, {
        groupId,
        filter: hallOfFame ? GroupContestFilter.Completed : GroupContestFilter.Active,
        offset: 0,
        limit: 24,
      });
      return { group, contests: groupContests };
    } catch (error) {
      if (error instanceof PublicQueryError && error.code === 'NOT_FOUND') return null;
      throw error;
    }
  },
);

export async function getGroupContestsMetadata(groupId: string, hallOfFame: boolean) {
  const data = await getGroupContestsSeoData(groupId, hallOfFame);
  return data ? groupContestsMetadata(data, hallOfFame, getWebOrigin()) : null;
}

export async function getPublicGroupContestCount() {
  return (await publicQuery(PublicGroupContestCountDocument, {})).publicGroupContestCount;
}

export async function getPublicGroupContestSitemapPage(page: number) {
  return (
    await publicQuery(PublicGroupContestSitemapDocument, {
      offset: page * PUBLIC_CONTEST_SITEMAP_SIZE,
      limit: PUBLIC_CONTEST_SITEMAP_SIZE,
    })
  ).publicGroupContests;
}
