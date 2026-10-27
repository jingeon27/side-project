'use client';

import { useEffect, useRef } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { readPostMutationOptions } from '@/features/post';
import type { PostDetail } from '@/shared/api';

export function usePostRead(detail: PostDetail | undefined, userId?: string) {
  const client = useQueryClient();
  const mutation = useMutation(readPostMutationOptions(client)),
    read = useRef('');
  const id = detail?.post.id,
    isOwner = !!userId && detail?.post.author.id === userId;
  const unreadAnswers =
    detail?.answers
      .filter((answer) => !answer.readAt && answer.author.id !== userId)
      .map((answer) => answer.id)
      .sort()
      .join(',') ||
    // 첫 페이지 뒤의 답변(최근 답변이 뒤에 온다)은 아직 받지 않았으므로 다음 페이지가 있으면 함께 읽음 처리한다.
    (detail?.answersCursor ? `later:${detail.answersCursor}` : '');
  const mutate = mutation.mutate;
  useEffect(() => {
    const stamp = `${id}:${userId}:${unreadAnswers}`;
    if (!id || !isOwner || !unreadAnswers || read.current === stamp) return;
    read.current = stamp;
    mutate(
      { id },
      {
        onError: () => {
          read.current = '';
        },
      },
    );
  }, [id, userId, isOwner, unreadAnswers, mutate]);
}
