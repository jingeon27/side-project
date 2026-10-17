import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChatRealtimeConnection } from './chat-realtime-connection';
import type { TChatConnection } from './chat.types';

export function useChatRealtime(userId: string | undefined, onSessionStale: () => void) {
  const client = useQueryClient();
  const [connection, setConnection] = useState<TChatConnection>('connecting');
  useEffect(() => {
    if (!userId) return;
    const channel = new ChatRealtimeConnection({
      userId,
      client,
      onConnection: setConnection,
      onSessionStale,
    });
    return channel.connect();
  }, [userId, client, onSessionStale]);
  return connection;
}
