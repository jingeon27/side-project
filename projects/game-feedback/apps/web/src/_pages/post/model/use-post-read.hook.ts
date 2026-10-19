'use client';
import { useEffect, useRef } from 'react';
import { useReadPostMutation } from '@/features/post';
import type { PostDetail } from '@/shared/api';
export function usePostRead(detail: PostDetail | undefined, userId?: string) {
  const mutation = useReadPostMutation(),
    read = useRef('');
  const id = detail?.post.id,
    isOwner = !!userId && detail?.post.author.id === userId;
  const unreadAnswers =
    detail?.answers
      .filter((answer) => !answer.readAt && answer.author.id !== userId)
      .map((answer) => answer.id)
      .sort()
      .join(',') || '';
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
