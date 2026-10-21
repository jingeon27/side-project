import { createComment, updateComment, deleteComment } from '@game-feedback/sdk';
import type { CreateCommentInput } from '@/shared/api';
export function postComment({ postId, body }: { postId: string; body: CreateCommentInput }) {
  return createComment(postId, body);
}
export function patchComment({ id, body }: { id: string; body: { body: string } }) {
  return updateComment(id, body);
}
export function deleteCommentById({ id }: { id: string; postId: string }) {
  return deleteComment(id);
}
