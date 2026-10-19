import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { ApiError, getPost, listPosts } from '@game-feedback/sdk';
import { serverRequestOptions, publicServerOptions } from '@/shared/api/server';
import type { TPostListParams } from '../types/post.type';

export async function getServerPostList(params: TPostListParams) {
  return listPosts(params, await serverRequestOptions());
}
export const getServerPost = cache(async (id: string) => {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) notFound();
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
