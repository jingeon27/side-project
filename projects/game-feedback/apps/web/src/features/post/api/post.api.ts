import { listPosts, getPost, createPost, updatePost, deletePost, readAnswers } from '@game-feedback/sdk';
import type { PostInput, PostPatchSchema } from '@game-feedback/contracts';
import type { z } from 'zod';
import type { TPostListParams } from '../types/post.type';
export function fetchPostList(params: TPostListParams = {}) {
  return listPosts(params);
}
export function fetchPostDetail({ id }: { id: string }) {
  return getPost(id);
}
export function postPost({ body }: { body: PostInput }) {
  return createPost(body);
}
export function patchPost({ id, body }: { id: string; body: z.input<typeof PostPatchSchema> }) {
  return updatePost(id, body);
}
export function deletePostById({ id }: { id: string }) {
  return deletePost(id);
}
export function postPostRead({ id }: { id: string }) {
  return readAnswers(id);
}
