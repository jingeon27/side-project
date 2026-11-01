import 'server-only';

import { cache } from 'react';
import { cacheLife, cacheTag } from 'next/cache';
import { notFound } from 'next/navigation';

import { POSTS_CACHE_TAG, PostSchema } from '@game-feedback/contracts';
import { ApiError, getPost, listPosts } from '@game-feedback/sdk';

import type { PostDetail } from '@/shared/api';
import { hasSessionCookie, publicServerOptions, serverRequestOptions } from '@/shared/api/server';

import type { TPostListParams } from '../types/post.type';
import { requestExcludedAuthors } from './excluded-authors.server';
import { filterCommentThreads } from './filter-comment-threads';
import { POST_ID_PATTERN, postDetailCacheTag } from './post-cache';

export async function getServerPostList(params: TPostListParams) {
  return listPosts(params, await serverRequestOptions());
}
// 쿠키 없이 받은 공개 상세라 모든 사용자가 게시글 id 하나로 같은 캐시를 쓴다. 없는 글은 null로 캐시한다.
// viewCount는 마지막 내용 변경 때의 값이다. 조회 집계는 이 태그를 만료하지 않고, 화면은 마운트 재조회와
// 조회 기록 응답(recordPostViewMutationOptions)으로 최신 값을 보여준다.
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
async function getServerExcludedAuthors(): Promise<ReadonlySet<string>> {
  if (!(await hasSessionCookie())) return new Set();
  return requestExcludedAuthors(await serverRequestOptions());
}
function withoutAuthors(detail: PostDetail, excluded: ReadonlySet<string>): PostDetail {
  return {
    ...detail,
    answers: detail.answers.filter((answer) => !excluded.has(answer.author.id)),
    comments: filterCommentThreads(detail.comments, excluded),
  };
}
async function getPrivateAnswerCounts(id: string) {
  const { baseUrl, headers, signal } = await serverRequestOptions();
  const response = await fetch(`${baseUrl}/internal/posts/${encodeURIComponent(id)}/answer-counts`, {
    headers,
    signal,
    cache: 'no-store',
  });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error(`Answer counts request failed with ${response.status}.`);
  return PostSchema.pick({ answerCount: true, helpfulCount: true }).parse(await response.json());
}
export const getServerPost = cache(async (id: string) => {
  if (!POST_ID_PATTERN.test(id)) notFound();
  const [detail, excluded] = await Promise.all([getPublicPost(id), getServerExcludedAuthors()]);
  if (!detail || excluded.has(detail.post.author.id)) notFound();
  if (!excluded.size) return detail;
  const counts = await getPrivateAnswerCounts(id);
  return { ...withoutAuthors(detail, excluded), post: { ...detail.post, ...counts } };
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
