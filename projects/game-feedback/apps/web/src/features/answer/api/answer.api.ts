import { createAnswer, deleteAnswer, markHelpful, updateAnswer } from '@game-feedback/sdk';

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
