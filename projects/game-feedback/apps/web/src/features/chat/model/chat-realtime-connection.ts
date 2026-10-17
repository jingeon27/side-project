import type { QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { chatMessageOptions, chatMessageScopeOptions, conversationScopeOptions } from './chat.options';
import type { TChatConnection } from './chat.types';

const invalidationSchema = z.object({ conversationId: z.string().min(1).max(128).nullable() });
interface IChatRealtimeOptions {
  userId: string;
  client: QueryClient;
  onConnection: (connection: TChatConnection) => void;
  onSessionStale: () => void;
}

export class ChatRealtimeConnection {
  private readonly lifetime = new AbortController();
  private stream: EventSource | null = null;
  private lastSessionCheck = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: IChatRealtimeOptions) {}

  connect() {
    this.options.onConnection(navigator.onLine ? 'connecting' : 'offline');
    this.openStream();
    const { signal } = this.lifetime;
    window.addEventListener('online', this.handleOnline, { signal });
    window.addEventListener('offline', this.handleOffline, { signal });
    document.addEventListener('visibilitychange', this.handleVisible, { signal });
    return this.dispose;
  }

  private refresh(conversationId?: string | null) {
    if (this.lifetime.signal.aborted) return;
    const { client, userId } = this.options;
    void client.invalidateQueries(conversationScopeOptions(userId));
    if (conversationId) {
      void client.invalidateQueries(chatMessageOptions(userId, conversationId));
      return;
    }
    void client.invalidateQueries(chatMessageScopeOptions(userId));
  }

  private openStream() {
    if (this.lifetime.signal.aborted) return;
    this.closeStream();
    this.stream = new EventSource('/api/chat/events', { withCredentials: true });
    this.stream.addEventListener('open', this.handleOpen);
    this.stream.addEventListener('invalidate', this.handleInvalidate);
    this.stream.addEventListener('error', this.handleError);
  }

  private closeStream() {
    this.stream?.removeEventListener('open', this.handleOpen);
    this.stream?.removeEventListener('invalidate', this.handleInvalidate);
    this.stream?.removeEventListener('error', this.handleError);
    this.stream?.close();
    this.stream = null;
  }

  private handleOpen = () => {
    if (this.lifetime.signal.aborted) return;
    this.options.onConnection('live');
    // Refetch REST data after reconnect because the stream carries no message history.
    this.refresh();
  };

  private handleInvalidate = (event: Event) => {
    if (this.lifetime.signal.aborted || !(event instanceof MessageEvent)) return;
    try {
      const data: unknown = JSON.parse(event.data);
      const parsed = invalidationSchema.safeParse(data);
      if (parsed.success) this.refresh(parsed.data.conversationId);
    } catch {
      // Ignore malformed events; reconnect and REST polling remain the recovery path.
    }
  };

  private handleError = () => {
    if (this.lifetime.signal.aborted) return;
    this.options.onConnection(navigator.onLine ? 'retrying' : 'offline');
    this.refresh();
    const now = Date.now();
    if (now - this.lastSessionCheck < 5_000) return;
    this.lastSessionCheck = now;
    this.options.onSessionStale();
  };

  private handleOnline = () => {
    if (this.lifetime.signal.aborted) return;
    this.options.onConnection('retrying');
    if (this.stream?.readyState === EventSource.CLOSED) this.openStream();
    this.refresh();
  };

  private handleOffline = () => {
    if (!this.lifetime.signal.aborted) this.options.onConnection('offline');
  };

  private handleVisible = () => {
    if (this.lifetime.signal.aborted || document.visibilityState !== 'visible') return;
    if (navigator.onLine && this.stream?.readyState === EventSource.CLOSED) {
      this.options.onConnection('retrying');
      this.openStream();
    }
    this.refresh();
  };

  dispose = () => {
    this.lifetime.abort();
    this.closeStream();
  };
}
