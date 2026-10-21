import 'server-only';
import { cache } from 'react';
import { cacheLife, cacheTag } from 'next/cache';
import { notFound } from 'next/navigation';
import { ApiError, getPost, listPosts } from '@game-feedback/sdk';
import { hasSessionCookie, serverRequestOptions, publicServerOptions } from '@/shared/api/server';
import type { TPostListParams } from '../types/post.type';

export async function getServerPostList(params: TPostListParams) {
  return listPosts(params, await serverRequestOptions());
}
// 비로그인 응답은 차단 관계가 반영되지 않는 공개 데이터라 게시글 id만으로 캐시한다. 없는 글은 null로 캐시한다.
async function getPublicPost(id: string) {
  'use cache';
  cacheTag(`post:${id}`);
  cacheLife({ stale: 60, revalidate: 60, expire: 3_600 });
  try {
    return await getPost(id, publicServerOptions());
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
export const getServerPost = cache(async (id: string) => {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) notFound();
  if (!(await hasSessionCookie())) return (await getPublicPost(id)) ?? notFound();
  try {
    return await getPost(id, await serverRequestOptions());
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
});
export const getServerUserPosts = cache(async (authorId: string, cursor = '') => {
  try {
    return await listPosts(
      { authorId, limit: 12, ...(cursor ? { cursor } : {}) },
      await serverRequestOptions(),
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) notFound();
    throw error;
  }
});
export function getPublicPostList(cursor?: string) {
  return listPosts({ board: 'ALL', limit: 50, ...(cursor ? { cursor } : {}) }, publicServerOptions());
}
