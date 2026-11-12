import { createAnswer, deleteAnswer, listPostAnswers, markHelpful, updateAnswer } from '@game-feedback/sdk';

import { withApiError } from '@/shared/api';

/** 상세에 싣지 않은 다음 답변. 상세 첫 페이지와 같은 크기로 나눈다. */
const ANSWER_PAGE = 30;

export function fetchPostAnswers({ postId, cursor }: { postId: string; cursor: string }) {
  return listPostAnswers(postId, { cursor, limit: ANSWER_PAGE });
}

// 쓰기 실패는 초안을 남긴 폼에 그대로 보이므로 브라우저의 연결 오류 원문 대신 다시 시도할 문구로 바꾼다.
export function postAnswer({ postId, body }: { postId: string; body: { body: string } }) {
  return withApiError(createAnswer(postId, body));
}
export function patchAnswer({ id, body }: { id: string; body: { body: string } }) {
  return withApiError(updateAnswer(id, body));
}
export function deleteAnswerById({ id }: { id: string; postId: string }) {
  return withApiError(deleteAnswer(id));
}
export function postHelpfulAnswer({ id, helpful }: { id: string; helpful: boolean }) {
  return withApiError(markHelpful(id, { helpful }));
}
