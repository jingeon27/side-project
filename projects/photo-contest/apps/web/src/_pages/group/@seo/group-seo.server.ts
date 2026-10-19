import 'server-only';

import { cache } from 'react';

import {
  GalleryPostsDocument,
  GroupVisibility,
  PostSort,
  PublicGroupCountDocument,
  PublicGroupSeoDocument,
  PublicGroupSitemapDocument,
} from '@/shared/api/generated';
import { publicQuery, PublicQueryError } from '@/shared/api/public-query.server';
import { getWebOrigin } from '@/shared/api/server-request.helper';

import { groupMetadata } from './group-seo.helper';
import type { IGroupSeoData } from './group-seo.type';

export const PUBLIC_GROUP_SITEMAP_SIZE = 48;

const readGroupSeoData = cache(async (id: string): Promise<IGroupSeoData | null> => {
  try {
    const { group } = await publicQuery(PublicGroupSeoDocument, { id });
    if (group.visibility !== GroupVisibility.Public) return { group, posts: [] };
    const { galleryPosts } = await publicQuery(GalleryPostsDocument, {
      groupId: id,
      sort: PostSort.Newest,
      offset: 0,
      limit: 24,
    });
    return { group, posts: galleryPosts };
  } catch (error) {
    if (error instanceof PublicQueryError && error.code === 'NOT_FOUND') return null;
    throw error;
  }
});

export async function getGroupSeoData(id: string) {
  return readGroupSeoData(id);
}

export async function getGroupMetadata(id: string) {
  const data = await getGroupSeoData(id);
  return data ? groupMetadata(data, getWebOrigin()) : null;
}

export async function getPublicGroupCount() {
  return (await publicQuery(PublicGroupCountDocument, {})).publicGroupCount;
}

export async function getPublicGroupSitemapPage(page: number) {
  return (
    await publicQuery(PublicGroupSitemapDocument, {
      offset: page * PUBLIC_GROUP_SITEMAP_SIZE,
      limit: PUBLIC_GROUP_SITEMAP_SIZE,
    })
  ).discoverGroups;
}
