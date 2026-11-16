import type { z } from 'zod';

import type { PostInput, PostPatchSchema } from '@game-feedback/contracts';
import {
  createPost,
  deletePost,
  getPost,
  listPosts,
  readAnswers,
  recordPostView,
  updatePost,
} from '@game-feedback/sdk';

import { withApiError } from '@/shared/api';

import type { TPostListParams } from '../types/post.type';

export function fetchPostList(params: TPostListParams = {}) {
  return listPosts(params);
}
export function fetchPostDetail({ id }: { id: string }) {
  return getPost(id);
}
// 쓰기 실패는 초안을 남긴 폼에 그대로 보이므로 브라우저의 연결 오류 원문 대신 다시 시도할 문구로 바꾼다.
export function postPost({ body }: { body: PostInput }) {
  return withApiError(createPost(body));
}
export function patchPost({ id, body }: { id: string; body: z.input<typeof PostPatchSchema> }) {
  return withApiError(updatePost(id, body));
}
export function deletePostById({ id }: { id: string }) {
  return withApiError(deletePost(id));
}
export function postPostRead({ id }: { id: string }) {
  return withApiError(readAnswers(id));
}
export function postPostView({ id, visitorId }: { id: string; visitorId: string }) {
  return withApiError(recordPostView(id, { visitorId }));
}
