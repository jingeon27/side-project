import { useMemo, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChatRealtimeConnection } from './chat-realtime-connection';

export function useChatRealtime(userId: string | undefined, onSessionStale: () => void) {
  const client = useQueryClient();
  const channel = useMemo(
    () => new ChatRealtimeConnection({ userId, client, onSessionStale }),
    [userId, client, onSessionStale],
  );
  return useSyncExternalStore(channel.subscribe, channel.getSnapshot, channel.getServerSnapshot);
}
