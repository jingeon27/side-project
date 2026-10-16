import { infiniteQueryOptions, queryOptions, skipToken } from '@tanstack/react-query';
import { compact } from 'es-toolkit';
import { fetchPostDetail, fetchPostList } from '../api/post.api';
import type { TPostListParams } from '../types/post.type';
export function postListOptions(params?: TPostListParams) {
  return infiniteQueryOptions({
    queryKey: compact(['fetchPostList', params]),
    queryFn: params
      ? ({ pageParam }) => fetchPostList({ ...params, ...(pageParam ? { cursor: pageParam } : {}) })
      : skipToken,
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 15_000,
  });
}
export function postDetailOptions(id?: string) {
  return queryOptions({
    queryKey: compact(['fetchPostDetail', id]),
    queryFn: id ? () => fetchPostDetail({ id }) : skipToken,
    staleTime: 15_000,
  });
}

export function userPostListOptions(authorId?: string, cursor = '') {
  return queryOptions({
    queryKey: [...postListOptions().queryKey, 'author', authorId, cursor],
    queryFn: authorId
      ? () => fetchPostList({ authorId, limit: 12, ...(cursor ? { cursor } : {}) })
      : skipToken,
  });
}
