import 'server-only';

import { cache } from 'react';
import {
  GalleryPostsDocument,
  GroupContestResultsDocument,
  GroupVisibility,
  Phase,
  PostSort,
  PublicGroupContestSeoDocument,
  PublicGroupSeoDocument,
} from '@/shared/api/generated';
import { publicQuery, PublicQueryError } from '@/shared/api/public-query.server';
import { getWebOrigin } from '@/shared/api/server-request.helper';
import { groupContestMetadata, type IGroupContestSeoData } from './group-contest-seo.helper';

export const getGroupContestSeoData = cache(
  async (groupId: string, contestId: string): Promise<IGroupContestSeoData | null> => {
    try {
      const { group } = await publicQuery(PublicGroupSeoDocument, { id: groupId });
      if (group.visibility !== GroupVisibility.Public) return { group, contest: null, posts: [] };
      const { groupContest: contest } = await publicQuery(PublicGroupContestSeoDocument, { id: contestId });
      if (contest.groupId !== groupId) return null;
      if (contest.phase === Phase.Completed) {
        const { groupContestResults } = await publicQuery(GroupContestResultsDocument, { contestId });
        return { group, contest, posts: groupContestResults.map((result) => result.post) };
      }
      const { galleryPosts } = await publicQuery(GalleryPostsDocument, {
        groupId,
        contestId,
        sort: PostSort.Newest,
        offset: 0,
        limit: 24,
      });
      return { group, contest, posts: galleryPosts };
    } catch (error) {
      if (
        error instanceof PublicQueryError &&
        ['NOT_FOUND', 'FORBIDDEN', 'UNAUTHENTICATED'].includes(error.code ?? '')
      )
        return null;
      throw error;
    }
  },
);

export async function getGroupContestMetadata(groupId: string, contestId: string) {
  const data = await getGroupContestSeoData(groupId, contestId);
  return data ? groupContestMetadata(data, contestId, getWebOrigin()) : null;
}
