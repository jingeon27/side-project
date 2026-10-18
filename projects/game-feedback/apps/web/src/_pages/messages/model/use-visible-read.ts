import { useCallback, useEffect, useState } from 'react';
import { useReadConversationMutation } from '@/features/chat';

interface IVisibleReadOptions {
  userId: string;
  conversationId: string;
  visibleBoundary: string;
  unavailable: boolean;
}

export function useVisibleRead({
  userId,
  conversationId,
  visibleBoundary,
  unavailable,
}: IVisibleReadOptions) {
  const [active, setActive] = useState(true);
  const mutation = useReadConversationMutation(userId, conversationId);
  const { mutate, variables } = mutation;

  useEffect(() => {
    function handleVisibility() {
      setActive(document.visibilityState === 'visible');
    }
    handleVisibility();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, []);

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
