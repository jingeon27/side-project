import 'server-only';

import { cache } from 'react';

import {
  GroupContestsDocument,
  GroupVisibility,
  PublicGroupContestCountDocument,
  PublicGroupContestSitemapDocument,
  PublicGroupSeoDocument,
} from '@/shared/api/generated';
import { PUBLIC_CONTENT_TTL, PUBLIC_SITEMAP_TTL } from '@/shared/api/public-cache.policy';
import { publicQuery, PublicQueryError } from '@/shared/api/public-query.server';
import { getWebOrigin } from '@/shared/api/server-request.helper';

import {
  groupContestsMetadata,
  type IGroupContestListing,
  type IGroupContestsSeoData,
} from './group-contests-seo.helper';

export const PUBLIC_CONTEST_SITEMAP_SIZE = 48;

export const getGroupContestsSeoData = cache(
  async (groupId: string, listing: IGroupContestListing): Promise<IGroupContestsSeoData | null> => {
    try {
      const { group } = await publicQuery(PublicGroupSeoDocument, { id: groupId });
      if (group.visibility !== GroupVisibility.Public) return { group, contests: [] };
      const { groupContestsPage } = await publicQuery(
        GroupContestsDocument,
        {
          groupId,
          filter: listing.filter,
          offset: 0,
          limit: 24,
        },
        PUBLIC_CONTENT_TTL,
      );
      return { group, contests: groupContestsPage.items };
    } catch (error) {
      if (error instanceof PublicQueryError && error.code === 'NOT_FOUND') return null;
      throw error;
    }
  },
);

export async function getGroupContestsMetadata(groupId: string, listing: IGroupContestListing) {
  const data = await getGroupContestsSeoData(groupId, listing);
  return data ? groupContestsMetadata(data, listing, getWebOrigin()) : null;
}

export async function getPublicGroupContestCount() {
  return (await publicQuery(PublicGroupContestCountDocument, {}, PUBLIC_SITEMAP_TTL)).publicGroupContestCount;
}

export async function getPublicGroupContestSitemapPage(page: number) {
  return (
    await publicQuery(
      PublicGroupContestSitemapDocument,
      {
        offset: page * PUBLIC_CONTEST_SITEMAP_SIZE,
        limit: PUBLIC_CONTEST_SITEMAP_SIZE,
      },
      PUBLIC_SITEMAP_TTL,
    )
  ).publicGroupContests;
}
