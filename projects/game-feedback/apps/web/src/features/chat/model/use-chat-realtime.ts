import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { chatMessageOptions, chatMessageScopeOptions, conversationScopeOptions } from './chat.options';
import type { TChatConnection } from './chat.types';

export function useChatRealtime(userId: string | undefined, onSessionStale: () => void) {
  const client = useQueryClient();
  const [connection, setConnection] = useState<TChatConnection>('connecting');

  useEffect(() => {
    if (!userId) return;
    const viewerId = userId;
    let disposed = false;
    let lastSessionCheck = 0;
    const stream = new EventSource('/api/chat/events', { withCredentials: true });

    function refresh(conversationId?: string | null) {
      if (disposed) return;
      void client.invalidateQueries(conversationScopeOptions(viewerId));
      if (conversationId) {
        void client.invalidateQueries(chatMessageOptions(viewerId, conversationId));
        return;
      }
      void client.invalidateQueries(chatMessageScopeOptions(viewerId));
    }

    function handleOpen() {
      if (disposed) return;
      setConnection('live');
      refresh();
    }

    function handleInvalidate(event: Event) {
      try {
        const data: unknown = JSON.parse((event as MessageEvent<string>).data);
        if (typeof data === 'object' && data !== null && 'conversationId' in data) {
          const conversationId = data.conversationId;
          if (typeof conversationId === 'string' || conversationId === null) {
            refresh(conversationId);
            return;
          }
        }
        refresh();
      } catch {
        refresh();
      }
    }

    function handleError() {
      if (disposed) return;
      setConnection(navigator.onLine ? 'retrying' : 'offline');
      refresh();
      const now = Date.now();
      if (now - lastSessionCheck < 5_000) return;
      lastSessionCheck = now;
      onSessionStale();
    }

    function handleOnline() {
      if (disposed) return;
      setConnection('retrying');
      refresh();
    }

    function handleOffline() {
      if (!disposed) setConnection('offline');
    }

    function handleVisible() {
      if (document.visibilityState === 'visible') refresh();
    }

    stream.addEventListener('open', handleOpen);
    stream.addEventListener('invalidate', handleInvalidate);
    stream.addEventListener('error', handleError);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      disposed = true;
      stream.close();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [userId, client, onSessionStale]);

  return connection;
}
