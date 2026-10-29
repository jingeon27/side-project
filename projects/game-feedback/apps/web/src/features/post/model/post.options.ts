import { infiniteQueryOptions, queryOptions, skipToken } from '@tanstack/react-query';
import { compact } from 'es-toolkit';

import { fetchPostDetail, fetchPostList } from '../api/post.api';
import type { TPostListParams } from '../types/post.type';

function postListScope(params?: TPostListParams) {
  return queryOptions({ queryKey: compact(['fetchPostList', params]), queryFn: skipToken });
}
function createPostListOptions(params: TPostListParams) {
  return infiniteQueryOptions({
    queryKey: postListScope(params).queryKey,
    queryFn: ({ pageParam }) => fetchPostList({ ...params, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 15_000,
  });
}
export function postListOptions(params: TPostListParams): ReturnType<typeof createPostListOptions>;
export function postListOptions(
  params?: TPostListParams,
): ReturnType<typeof createPostListOptions> | ReturnType<typeof postListScope>;
export function postListOptions(params?: TPostListParams) {
  return params ? createPostListOptions(params) : postListScope();
}

function postDetailScope() {
  return queryOptions({ queryKey: ['fetchPostDetail'], queryFn: skipToken });
}
function createPostDetailOptions(id: string) {
  return queryOptions({
    queryKey: [...postDetailScope().queryKey, id],
    queryFn: () => fetchPostDetail({ id }),
    staleTime: 15_000,
  });
}
export function postDetailOptions(id: string): ReturnType<typeof createPostDetailOptions>;
export function postDetailOptions(
  id?: string,
): ReturnType<typeof createPostDetailOptions> | ReturnType<typeof postDetailScope>;
export function postDetailOptions(id?: string) {
  return id ? createPostDetailOptions(id) : postDetailScope();
}

export function userPostListOptions(authorId: string, cursor = '') {
  return queryOptions({
    queryKey: [...postListOptions().queryKey, 'author', authorId, cursor],
    queryFn: () => fetchPostList({ authorId, limit: 12, ...(cursor ? { cursor } : {}) }),
  });
}
