import {
  EventStreamContentType,
  fetchEventSource,
  type EventSourceMessage,
} from '@microsoft/fetch-event-source';
import type { QueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { z } from 'zod';

import { notificationListOptions } from '@/features/notification';

import { chatMessageOptions, chatMessageScopeOptions, conversationScopeOptions } from './chat.options';
import type { TChatConnection } from './chat.types';

const invalidationSchema = z.object({ conversationId: z.string().min(1).max(128).nullable() });
interface IChatRealtimeOptions {
  userId?: string;
  client: QueryClient;
  onSessionStale: () => void;
}

class ChatStreamAccessError extends Error {}

/** Owns one viewer's connection. Message data remains in the authenticated REST query cache. */
export class ChatRealtimeConnection {
  private readonly listeners = new Set<() => void>();
  private lifetime: AbortController | null = null;
  private stream: AbortController | null = null;
  private connection: TChatConnection = 'connecting';
  private failures = 0;
  private retryAfter = 0;
  private lastSessionCheck = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: IChatRealtimeOptions) {}

  getSnapshot = () => this.connection;
  getServerSnapshot = (): TChatConnection => 'connecting';

  subscribe = (onChange: () => void) => {
    this.listeners.add(onChange);
    if (this.listeners.size === 1 && this.options.userId) this.connect();
    return () => {
      this.listeners.delete(onChange);
      if (this.listeners.size === 0) this.dispose();
    };
  };

  private connect() {
    this.lifetime = new AbortController();
    const { signal } = this.lifetime;
    window.addEventListener('online', this.handleOnline, { signal });
    window.addEventListener('offline', this.handleOffline, { signal });
    document.addEventListener('visibilitychange', this.handleVisible, { signal });
    this.publish(navigator.onLine ? 'connecting' : 'offline');
    this.openStream();
  }

  private publish(connection: TChatConnection) {
    if (this.connection === connection) return;
    this.connection = connection;
    for (const listener of this.listeners) listener();
  }

  private active(stream: AbortController) {
    return this.stream === stream && !stream.signal.aborted && Boolean(this.lifetime);
  }

  private refresh(conversationId?: string | null) {
    const { client, userId } = this.options;
    if (!this.lifetime || !userId) return;
    void client.invalidateQueries(conversationScopeOptions(userId));
    void client.invalidateQueries(notificationListOptions(userId));
    if (conversationId) {
      void client.invalidateQueries(chatMessageOptions(userId, conversationId));
      return;
    }
    void client.invalidateQueries(chatMessageScopeOptions(userId));
  }

  private openStream() {
    if (!this.lifetime || !navigator.onLine || this.stream) return;
    const stream = new AbortController();
    this.stream = stream;
    // The library suspends hidden-page connections and reopens them on foreground.
    void fetchEventSource('/api/chat/events', {
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: EventStreamContentType },
      signal: stream.signal,
      openWhenHidden: false,
      onopen: async (response) => {
        if (!this.active(stream)) return;
        if ([401, 403].includes(response.status)) throw new ChatStreamAccessError('Session unavailable');
        if (!response.ok || !response.headers.get('content-type')?.startsWith(EventStreamContentType)) {
          const seconds = Number(response.headers.get('retry-after'));
          this.retryAfter = Number.isFinite(seconds) ? Math.min(60_000, Math.max(0, seconds * 1000)) : 0;
          throw new Error('Chat stream unavailable');
        }
        this.failures = 0;
        this.retryAfter = 0;
        this.publish('live');
        // Events carry invalidations, so REST recovers messages missed while disconnected.
        this.refresh();
      },
      onmessage: (event) => this.handleMessage(stream, event),
      onclose: () => {
        if (this.active(stream)) throw new Error('Chat stream closed');
      },
      onerror: (error: unknown) => {
        if (!this.active(stream)) return;
        this.publish(navigator.onLine ? 'retrying' : 'offline');
        this.refresh();
        const now = dayjs().valueOf();
        if (error instanceof ChatStreamAccessError || now - this.lastSessionCheck >= 5_000) {
          this.lastSessionCheck = now;
          this.options.onSessionStale();
        }
        if (error instanceof ChatStreamAccessError) throw error;
        this.failures += 1;
        return Math.max(this.retryAfter, Math.min(30_000, 1000 * 2 ** Math.min(this.failures - 1, 5)));
      },
    }).catch(() => {
      // Access failures already requested a session refresh; never expose response payloads.
    });
  }

  private handleMessage(stream: AbortController, event: EventSourceMessage) {
    if (!this.active(stream) || event.event !== 'invalidate') return;
    try {
      const data: unknown = JSON.parse(event.data);
      const parsed = invalidationSchema.safeParse(data);
      if (parsed.success) this.refresh(parsed.data.conversationId);
    } catch {
      // Ignore malformed events. Reconnection and authenticated REST restore the data.
    }
  }

  private handleOnline = () => {
    if (!this.lifetime) return;
    if (!this.stream) {
      this.publish('retrying');
      this.openStream();
    }
    this.refresh();
  };

  private handleOffline = () => {
    this.stream?.abort();
    this.stream = null;
    this.publish('offline');
  };

  private handleVisible = () => {
    if (!this.lifetime || document.visibilityState !== 'visible') return;
    if (navigator.onLine) this.openStream();
    this.refresh();
  };

  private dispose() {
    this.lifetime?.abort();
    this.lifetime = null;
    this.stream?.abort();
    this.stream = null;
  }
}
