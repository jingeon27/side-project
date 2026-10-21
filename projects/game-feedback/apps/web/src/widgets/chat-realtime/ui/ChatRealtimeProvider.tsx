'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { sessionOptions } from '@/features/auth';
import { useChatRealtime, type TChatConnection } from '@/features/chat';

interface IChatRealtimeProviderProps {
  userId?: string;
  children: ReactNode;
}

const ChatRealtimeContext = createContext<TChatConnection>('connecting');

export function useChatConnection() {
  return useContext(ChatRealtimeContext);
}

export function ChatRealtimeProvider({ userId, children }: IChatRealtimeProviderProps) {
  const client = useQueryClient();
  const handleSessionStale = useCallback(() => {
    void client.invalidateQueries(sessionOptions());
  }, [client]);
  const connection = useChatRealtime(userId, handleSessionStale);
  return <ChatRealtimeContext.Provider value={connection}>{children}</ChatRealtimeContext.Provider>;
}
