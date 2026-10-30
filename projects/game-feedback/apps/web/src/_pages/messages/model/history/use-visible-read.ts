import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { readConversationMutationOptions } from '@/features/chat';

interface IVisibleReadOptions {
  userId: string;
  conversationId: string;
  visibleBoundary: string;
  unavailable: boolean;
}

function subscribeVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  window.addEventListener('focus', onChange);
  return () => {
    document.removeEventListener('visibilitychange', onChange);
    window.removeEventListener('focus', onChange);
  };
}
const pageVisible = () => document.visibilityState === 'visible';
// 서버 HTML에는 읽음 경계를 보내지 않는다.
const serverPageVisible = () => false;

export function useVisibleRead({
  userId,
  conversationId,
  visibleBoundary,
  unavailable,
}: IVisibleReadOptions) {
  const client = useQueryClient();
  const active = useSyncExternalStore(subscribeVisibility, pageVisible, serverPageVisible);
  const mutation = useMutation(readConversationMutationOptions(client, userId, conversationId));
  const { mutate, variables } = mutation;

  useEffect(() => {
    if (!active || !visibleBoundary || unavailable || variables === visibleBoundary) return;
    mutate(visibleBoundary);
  }, [active, visibleBoundary, unavailable, mutate, variables]);

  const handleRetryRead = useCallback(() => {
    if (!active || !visibleBoundary || unavailable) return;
    mutate(visibleBoundary);
  }, [active, visibleBoundary, unavailable, mutate]);

  return { mutation, handleRetryRead };
}
