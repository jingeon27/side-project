import 'server-only';

import { cache } from 'react';
import { cacheLife, cacheTag } from 'next/cache';
import { notFound } from 'next/navigation';

import { z } from 'zod';

import { POSTS_CACHE_TAG } from '@game-feedback/contracts';
import { ApiError, getPost, listPosts } from '@game-feedback/sdk';

import type { PostDetail } from '@/shared/api';
import { hasSessionCookie, publicServerOptions, serverRequestOptions } from '@/shared/api/server';

import type { TPostListParams } from '../types/post.type';
import { filterCommentThreads } from './filter-comment-threads';
import { POST_ID_PATTERN, postDetailCacheTag } from './post-cache';

const ExcludedAuthorsSchema = z.object({ userIds: z.array(z.string()) });

export async function getServerPostList(params: TPostListParams) {
  return listPosts(params, await serverRequestOptions());
}
// 쿠키 없이 받은 공개 상세라 모든 사용자가 게시글 id 하나로 같은 캐시를 쓴다. 없는 글은 null로 캐시한다.
async function getPublicPost(id: string) {
  'use cache';
  cacheTag(POSTS_CACHE_TAG, postDetailCacheTag(id));
  cacheLife('max');
  try {
    return await getPost(id, publicServerOptions());
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
// 차단 관계는 사용자마다 달라 캐시하지 않는다. 자신을 차단한 사람이 드러나지 않게 브라우저가 닿지 않는 내부 경로로 받는다.
async function getServerExcludedAuthors(): Promise<ReadonlySet<string>> {
  if (!(await hasSessionCookie())) return new Set();
  const { baseUrl, headers, signal } = await serverRequestOptions();
  const response = await fetch(`${baseUrl}/internal/visibility/excluded-authors`, { headers, signal });
  if (!response.ok) throw new Error(`Excluded authors request failed with ${response.status}.`);
  return new Set(ExcludedAuthorsSchema.parse(await response.json()).userIds);
}
function withoutAuthors(detail: PostDetail, excluded: ReadonlySet<string>): PostDetail {
  return {
    ...detail,
    answers: detail.answers.filter((answer) => !excluded.has(answer.author.id)),
    comments: filterCommentThreads(detail.comments, excluded),
  };
}
export const getServerPost = cache(async (id: string) => {
  if (!POST_ID_PATTERN.test(id)) notFound();
  const [detail, excluded] = await Promise.all([getPublicPost(id), getServerExcludedAuthors()]);
  if (!detail || excluded.has(detail.post.author.id)) notFound();
  return excluded.size ? withoutAuthors(detail, excluded) : detail;
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
