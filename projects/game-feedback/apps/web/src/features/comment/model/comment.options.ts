import { infiniteQueryOptions, skipToken } from '@tanstack/react-query';

import { postDetailOptions } from '@/features/post';

import { fetchPostComments } from '../api/comment.api';

/**
 * 상세 첫 페이지보다 이전의 원댓글 스레드. 키를 게시글 상세 아래에 두어 댓글 변경이 상세를 무효화할 때 함께
 * 다시 받는다. 첫 페이지가 바뀌어 커서가 달라지면 새 키로 처음부터 다시 받는다.
 */
export function olderCommentOptions(postId: string, cursor: string | null) {
  return infiniteQueryOptions({
    queryKey: [...postDetailOptions(postId).queryKey, 'older-comments', cursor],
    queryFn: cursor ? ({ pageParam }) => fetchPostComments({ postId, cursor: pageParam }) : skipToken,
    initialPageParam: cursor ?? '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 15_000,
  });
}
