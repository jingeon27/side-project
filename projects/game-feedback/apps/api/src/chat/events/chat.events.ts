import { Inject, Injectable, type MessageEvent, type OnModuleDestroy } from '@nestjs/common';
import dayjs from 'dayjs';
import { countBy } from 'es-toolkit';
import { Observable, type Subscriber } from 'rxjs';

import type { SessionRequest } from '../../auth/session/session.types';
import { ApiError } from '../../common/http/api-error';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { PrismaClient } from '../../generated/prisma';
import {
  measureChatOperation,
  recordChatConnections,
  recordChatPublish,
  recordChatStreamClosed,
  recordChatStreamOpened,
  type TPublishOutcome,
  type TStreamCloseReason,
} from '../../monitoring/chat-metrics';
import { reportUnexpectedError } from '../../monitoring/sentry';

type Client = {
  userId: string;
  sessionHash: string;
  subscriber: Subscriber<MessageEvent>;
  openedAt: number;
  closeReason?: TStreamCloseReason;
};

/** Session re-check and heartbeat interval shared by every open stream. */
export const CHAT_EVENTS_HEARTBEAT_MS = 5000;
/** Tabs of one browser share a session; the oldest stream closes when another opens. */
export const MAX_STREAMS_PER_SESSION = 4;
/** Several devices or browsers of one user; bounds the streams and re-checks one account can hold open. */
export const MAX_STREAMS_PER_USER = 8;

function sessionKey(session: { tokenHash: string; userId: string | null }) {
  return `${session.tokenHash}:${session.userId ?? ''}`;
}

/** Per-process invalidation stream. Private content is always fetched through authenticated REST. */
@Injectable()
export class ChatEvents implements OnModuleDestroy {
  private readonly clients = new Set<Client>();
  private heartbeat: { timer: NodeJS.Timeout; checking: boolean } | undefined;
  canAccess: (userId: string, conversationId: string) => Promise<boolean> = async () => false;
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** One query for every distinct session: existence, same user, expiry and the test-account rule. */
  private async validSessions(clients: readonly Client[]): Promise<ReadonlySet<string>> {
    const sessions = await this.db.session.findMany({
      where: { tokenHash: { in: [...new Set(clients.map((client) => client.sessionHash))] } },
      select: { tokenHash: true, userId: true, expiresAt: true, user: { select: { demoKey: true } } },
    });
    const now = dayjs().valueOf();
    return new Set(
      sessions
        .filter(
          (session) =>
            !!session.user &&
            session.expiresAt.getTime() > now &&
            (this.config.demoMode || this.config.testAuthEnabled || !session.user.demoKey),
        )
        .map(sessionKey),
    );
  }
  private async authenticated(client: Client): Promise<boolean> {
    const valid = await this.validSessions([client]);
    return valid.has(sessionKey({ tokenHash: client.sessionHash, userId: client.userId }));
  }
  private startHeartbeat() {
    if (this.heartbeat) return;
    const timer = setInterval(() => void this.recheck(), CHAT_EVENTS_HEARTBEAT_MS);
    timer.unref();
    this.heartbeat = { timer, checking: false };
  }
  private stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat.timer);
    this.heartbeat = undefined;
  }
  /** Re-checks every open stream with one session query per tick and sends the heartbeat to the valid ones. */
  private async recheck() {
    const heartbeat = this.heartbeat;
    const clients = [...this.clients];
    if (!heartbeat || heartbeat.checking || !clients.length) return;
    heartbeat.checking = true;
    try {
      await measureChatOperation('chat.heartbeat', async () => {
        const valid = await this.validSessions(clients);
        for (const client of clients) {
          const alive = valid.has(sessionKey({ tokenHash: client.sessionHash, userId: client.userId }));
          if (!alive) this.closeClient(client, 'session_invalid');
          if (alive && !client.subscriber.closed) client.subscriber.next({ type: 'heartbeat', data: {} });
        }
      });
    } catch (error) {
      reportUnexpectedError(error, { component: 'chat.events', operation: 'heartbeat' });
      for (const client of clients) this.closeClient(client, 'heartbeat_failed');
    } finally {
      heartbeat.checking = false;
      recordChatConnections(this.clients.size);
    }
  }
  private closeClient(client: Client, reason: TStreamCloseReason) {
    if (client.subscriber.closed) return;
    client.closeReason = reason;
    client.subscriber.complete();
  }
  private closeOldest(matches: (client: Client) => boolean, limit: number, reason: TStreamCloseReason) {
    const open = [...this.clients].filter(matches);
    const oldest = open[0];
    if (open.length >= limit && oldest) this.closeClient(oldest, reason);
  }
  stream(req: SessionRequest): Observable<MessageEvent> {
    const session = req.gfSession;
    if (!session?.user) throw new ApiError(401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
    const userId = session.user.id;
    return new Observable((subscriber) => {
      const client: Client = {
        userId,
        sessionHash: session.tokenHash,
        subscriber,
        openedAt: performance.now(),
      };
      this.closeOldest(
        (item) => item.sessionHash === client.sessionHash,
        MAX_STREAMS_PER_SESSION,
        'session_limit',
      );
      this.closeOldest((item) => item.userId === client.userId, MAX_STREAMS_PER_USER, 'user_limit');
      this.clients.add(client);
      recordChatStreamOpened(this.clients.size);
      this.startHeartbeat();
      // Reconnection always refreshes the complete list, covering events missed while disconnected.
      void this.checkAndSend(client, null);
      return () => {
        this.clients.delete(client);
        recordChatStreamClosed(
          client.closeReason ?? 'client_disconnect',
          performance.now() - client.openedAt,
          this.clients.size,
        );
        if (!this.clients.size) this.stopHeartbeat();
      };
    });
  }
  private async checkAndSend(client: Client, conversationId: string | null): Promise<TPublishOutcome> {
    try {
      if (!(await this.authenticated(client))) {
        this.closeClient(client, 'session_invalid');
        return 'unavailable';
      }
      if (conversationId && !(await this.canAccess(client.userId, conversationId))) return 'denied';
      if (client.subscriber.closed) return 'unavailable';
      client.subscriber.next({ type: 'invalidate', retry: 3000, data: { conversationId } });
      return 'sent';
    } catch (error) {
      reportUnexpectedError(error, { component: 'chat.events', operation: 'delivery' });
      this.closeClient(client, 'delivery_failed');
      return 'failed';
    }
  }
  async publish(userIds: string[], conversationId: string | null) {
    const recipients = new Set(userIds);
    await measureChatOperation('chat.publish', async (span) => {
      const results = await Promise.allSettled(
        [...this.clients]
          .filter((client) => recipients.has(client.userId))
          .map((client) => this.checkAndSend(client, conversationId)),
      );
      const outcomes = countBy(results, (result) =>
        result.status === 'fulfilled' ? result.value : 'failed',
      );
      span.setAttributes({
        'chat.publish.recipients': results.length,
        'chat.publish.sent': outcomes.sent ?? 0,
        'chat.publish.unavailable': outcomes.unavailable ?? 0,
        'chat.publish.denied': outcomes.denied ?? 0,
        'chat.publish.failed': outcomes.failed ?? 0,
      });
      if (outcomes.failed) span.setStatus({ code: 2 });
      recordChatPublish(outcomes, results.length);
    });
  }
  closeSession(sessionHash: string) {
    for (const client of this.clients)
      if (client.sessionHash === sessionHash) this.closeClient(client, 'session_closed');
  }
  closeUser(userId: string) {
    for (const client of this.clients) if (client.userId === userId) this.closeClient(client, 'user_closed');
  }
  closeAll() {
    for (const client of this.clients) this.closeClient(client, 'server_shutdown');
  }
  onModuleDestroy() {
    this.closeAll();
    this.stopHeartbeat();
  }
}
