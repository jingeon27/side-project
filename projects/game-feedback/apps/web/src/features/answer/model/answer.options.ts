import { infiniteQueryOptions, skipToken } from '@tanstack/react-query';

import { postDetailOptions } from '@/features/post';

import { fetchPostAnswers } from '../api/answer.api';

/**
 * 상세 첫 페이지 다음의 답변. 키를 게시글 상세 아래에 두어 답변 변경이 상세를 무효화할 때 함께 다시 받는다.
 * 첫 페이지가 바뀌어 커서가 달라지면 새 키로 처음부터 다시 받는다.
 */
export function laterAnswerOptions(postId: string, cursor: string | null) {
  return infiniteQueryOptions({
    queryKey: [...postDetailOptions(postId).queryKey, 'later-answers', cursor],
    queryFn: cursor ? ({ pageParam }) => fetchPostAnswers({ postId, cursor: pageParam }) : skipToken,
    initialPageParam: cursor ?? '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 15_000,
  });
}
