'use client';

import { useEffect } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { readPostMutationOptions } from '@/features/post';
import type { PostDetail } from '@/shared/api';

export function usePostRead(detail: PostDetail | undefined, userId?: string) {
  const client = useQueryClient();
  const { mutate, variables } = useMutation(readPostMutationOptions(client));
  const id = detail?.post.id,
    isOwner = !!userId && detail?.post.author.id === userId;
  const unreadAnswerIds =
    detail?.answers
      .filter((answer) => !answer.readAt && answer.author.id !== userId)
      .map((answer) => answer.id)
      .sort()
      .join(',') ||
    // 첫 페이지 뒤의 답변(최근 답변이 뒤에 온다)은 아직 받지 않았으므로 다음 페이지가 있으면 함께 읽음 처리한다.
    (detail?.answersCursor ? `later:${detail.answersCursor}` : '');
  useEffect(() => {
    if (!id || !isOwner || !unreadAnswerIds) return;
    // 같은 글의 같은 미확인 답변 묶음은 한 번만 보낸다. 실패하면 묶음이 바뀔 때 다시 보낸다.
    if (variables?.id === id && variables.unreadAnswerIds === unreadAnswerIds) return;
    mutate({ id, unreadAnswerIds });
  }, [id, isOwner, unreadAnswerIds, mutate, variables]);
}
