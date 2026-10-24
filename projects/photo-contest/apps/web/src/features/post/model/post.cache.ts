import type { ApolloCache, ObservableQuery } from '@apollo/client';

import {
  GalleryPostsDocument,
  MyGalleryPostsDocument,
  PostSort,
  PublicGalleryPostsDocument,
} from '@/shared/api/generated';

export const POST_FEED_QUERIES = [GalleryPostsDocument, PublicGalleryPostsDocument, MyGalleryPostsDocument];

export function resetGalleryPosts(cache: ApolloCache) {
  cache.evict({ id: 'ROOT_QUERY', fieldName: 'galleryPosts' });
  cache.evict({ id: 'ROOT_QUERY', fieldName: 'publicGalleryPosts' });
  cache.evict({ id: 'ROOT_QUERY', fieldName: 'myGalleryPosts' });
  cache.gc();
}

/** 인기 목록은 서버 순위를 다시 받고, 더 읽은 최신 목록은 유지한다. */
export function refreshMonthlyPopular(query: ObservableQuery) {
  if (query.variables.sort !== PostSort.MonthlyPopular) return false;
  return query.refetch();
}
