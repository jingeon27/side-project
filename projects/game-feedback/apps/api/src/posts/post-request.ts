import { isEqual } from 'es-toolkit';

import type { Post } from '../generated/prisma';
import type { TCreatePostDto } from './post-input.dto';

type TStoredPost = Pick<
  Post,
  | 'categoryId'
  | 'board'
  | 'title'
  | 'body'
  | 'document'
  | 'coaching'
  | 'friendSale'
  | 'battle'
  | 'hidden'
  | 'deletedAt'
>;

/**
 * 같은 요청 키로 다시 온 글쓰기가 처음 저장한 글과 같은 내용인지 본다. JSON 열은 키 순서와 무관하게 비교한다.
 * 숨기거나 지운 글은 같은 요청의 결과로 돌려주지 않는다.
 */
export function isSamePostRequest(post: TStoredPost, input: TCreatePostDto, categoryId: string) {
  return (
    !post.hidden &&
    !post.deletedAt &&
    post.categoryId === categoryId &&
    post.board === (input.board ?? 'FEEDBACK') &&
    post.title === input.title &&
    post.body === input.body &&
    isEqual(post.document, input.document ?? null) &&
    isEqual(post.coaching, input.coaching ?? null) &&
    isEqual(post.friendSale, input.friendSale ?? null) &&
    isEqual(post.battle, input.battle ?? null)
  );
}
