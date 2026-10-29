import { createAnswer, deleteAnswer, listPostAnswers, markHelpful, updateAnswer } from '@game-feedback/sdk';

/** 상세에 싣지 않은 다음 답변. 상세 첫 페이지와 같은 크기로 나눈다. */
const ANSWER_PAGE = 30;

export function fetchPostAnswers({ postId, cursor }: { postId: string; cursor: string }) {
  return listPostAnswers(postId, { cursor, limit: ANSWER_PAGE });
}

export function postAnswer({ postId, body }: { postId: string; body: { body: string } }) {
  return createAnswer(postId, body);
}
export function patchAnswer({ id, body }: { id: string; body: { body: string } }) {
  return updateAnswer(id, body);
}
export function deleteAnswerById({ id }: { id: string; postId: string }) {
  return deleteAnswer(id);
}
export function postHelpfulAnswer({ id, helpful }: { id: string; helpful: boolean }) {
  return markHelpful(id, { helpful });
}
