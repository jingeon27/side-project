import {
  createComment,
  deleteComment,
  listCommentReplies,
  listPostComments,
  updateComment,
} from '@game-feedback/sdk';

import type { CreateCommentInput } from '@/shared/api';

/** 상세에 싣지 않은 이전 원댓글 스레드. 상세 첫 페이지와 같은 크기로 나눈다. */
const COMMENT_THREAD_PAGE = 30;
const COMMENT_REPLY_PAGE = 30;

export function fetchPostComments({ postId, cursor }: { postId: string; cursor: string }) {
  return listPostComments(postId, { cursor, limit: COMMENT_THREAD_PAGE });
}
export function fetchCommentReplies({ commentId, cursor }: { commentId: string; cursor: string }) {
  return listCommentReplies(commentId, { cursor, limit: COMMENT_REPLY_PAGE });
}
export function postComment({ postId, body }: { postId: string; body: CreateCommentInput }) {
  return createComment(postId, body);
}
export function patchComment({ id, body }: { id: string; body: { body: string } }) {
  return updateComment(id, body);
}
export function deleteCommentById({ id }: { id: string; postId: string }) {
  return deleteComment(id);
}
