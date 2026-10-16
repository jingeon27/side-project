import { useEffect, useRef, useState } from 'react';
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
  const lastAttempt = useRef('');
  const mutation = useReadConversationMutation(userId, conversationId);
  const { mutate } = mutation;

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
    if (!active || !visibleBoundary || unavailable || lastAttempt.current === visibleBoundary) return;
    lastAttempt.current = visibleBoundary;
    mutate(visibleBoundary);
  }, [active, visibleBoundary, unavailable, mutate]);

  function handleRetryRead() {
    if (!active || !visibleBoundary || unavailable) return;
    mutate(visibleBoundary);
  }

  return { mutation, handleRetryRead };
}
