'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
type ConnectionState = 'connecting' | 'live' | 'retrying' | 'offline';
const ChatRealtimeContext = createContext<ConnectionState>('connecting');
export function useChatConnection() {
  return useContext(ChatRealtimeContext);
}
export function ChatRealtimeProvider({ userId, children }: { userId?: string; children: ReactNode }) {
  const client = useQueryClient(),
    [connection, setConnection] = useState<ConnectionState>('connecting');
  useEffect(() => {
    if (!userId) return;
    let disposed = false,
      lastSessionCheck = 0;
    setConnection(navigator.onLine ? 'connecting' : 'offline');
    const stream = new EventSource('/api/chat/events', { withCredentials: true });
    const refresh = (conversationId?: string | null) => {
      if (disposed) return;
      void client.invalidateQueries({ queryKey: ['chat', userId, 'conversations'] });
      void client.invalidateQueries({
        queryKey: conversationId
          ? ['chat', userId, 'messages', conversationId]
          : ['chat', userId, 'messages'],
      });
    };
    stream.onopen = () => {
      if (!disposed) {
        setConnection('live');
        refresh();
      }
    };
    stream.addEventListener('invalidate', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent<string>).data) as { conversationId?: string | null };
        refresh(data.conversationId);
      } catch {
        refresh();
      }
    });
    stream.onerror = () => {
      if (!disposed) {
        setConnection(navigator.onLine ? 'retrying' : 'offline');
        refresh();
        const now = Date.now();
        if (now - lastSessionCheck >= 5_000) {
          lastSessionCheck = now;
          void client.invalidateQueries({ queryKey: ['session'] });
        }
      }
    };
    const onOnline = () => {
      setConnection('retrying');
      refresh();
    };
    const onOffline = () => setConnection('offline');
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      stream.close();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, client]);
  return <ChatRealtimeContext.Provider value={connection}>{children}</ChatRealtimeContext.Provider>;
}
