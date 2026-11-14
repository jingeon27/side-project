import {
  createComment,
  deleteComment,
  listCommentReplies,
  listPostComments,
  updateComment,
} from '@game-feedback/sdk';

import { withApiError, type CreateCommentInput } from '@/shared/api';

/** 상세에 싣지 않은 이전 원댓글 스레드. 상세 첫 페이지와 같은 크기로 나눈다. */
const COMMENT_THREAD_PAGE = 30;
const COMMENT_REPLY_PAGE = 30;

export function fetchPostComments({ postId, cursor }: { postId: string; cursor: string }) {
  return listPostComments(postId, { cursor, limit: COMMENT_THREAD_PAGE });
}
export function fetchCommentReplies({ commentId, cursor }: { commentId: string; cursor: string }) {
  return listCommentReplies(commentId, { cursor, limit: COMMENT_REPLY_PAGE });
}
// 쓰기 실패는 초안을 남긴 폼에 그대로 보이므로 브라우저의 연결 오류 원문 대신 다시 시도할 문구로 바꾼다.
export function postComment({ postId, body }: { postId: string; body: CreateCommentInput }) {
  return withApiError(createComment(postId, body));
}
export function patchComment({ id, body }: { id: string; body: { body: string } }) {
  return withApiError(updateComment(id, body));
}
export function deleteCommentById({ id }: { id: string; postId: string }) {
  return withApiError(deleteComment(id));
}
