import { Inject, Injectable, type MessageEvent, type OnModuleDestroy } from '@nestjs/common';
import { Observable, type Subscriber } from 'rxjs';

import type { SessionRequest } from '../../auth/session/session.types';
import { ApiError } from '../../common/http/api-error';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { PrismaClient } from '../../generated/prisma';

type Client = { userId: string; sessionHash: string; subscriber: Subscriber<MessageEvent> };

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
    const now = Date.now();
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
      const valid = await this.validSessions(clients);
      for (const client of clients) {
        const alive = valid.has(sessionKey({ tokenHash: client.sessionHash, userId: client.userId }));
        if (!alive) client.subscriber.complete();
        if (alive && !client.subscriber.closed) client.subscriber.next({ type: 'heartbeat', data: {} });
      }
    } catch {
      for (const client of clients) client.subscriber.complete();
    } finally {
      heartbeat.checking = false;
    }
  }
  private closeOldest(matches: (client: Client) => boolean, limit: number) {
    const open = [...this.clients].filter(matches);
    if (open.length >= limit) open[0]?.subscriber.complete();
  }
  stream(req: SessionRequest): Observable<MessageEvent> {
    const session = req.gfSession;
    if (!session?.user) throw new ApiError(401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
    const userId = session.user.id;
    return new Observable((subscriber) => {
      const client: Client = { userId, sessionHash: session.tokenHash, subscriber };
      this.closeOldest((item) => item.sessionHash === client.sessionHash, MAX_STREAMS_PER_SESSION);
      this.closeOldest((item) => item.userId === client.userId, MAX_STREAMS_PER_USER);
      this.clients.add(client);
      this.startHeartbeat();
      // Reconnection always refreshes the complete list, covering events missed while disconnected.
      void this.checkAndSend(client, null);
      return () => {
        this.clients.delete(client);
        if (!this.clients.size) this.stopHeartbeat();
      };
    });
  }
  private async checkAndSend(client: Client, conversationId: string | null) {
    try {
      if (!(await this.authenticated(client))) {
        client.subscriber.complete();
        return;
      }
      if (conversationId && !(await this.canAccess(client.userId, conversationId))) return;
      if (!client.subscriber.closed)
        client.subscriber.next({ type: 'invalidate', retry: 3000, data: { conversationId } });
    } catch {
      client.subscriber.complete();
    }
  }
  async publish(userIds: string[], conversationId: string | null) {
    const recipients = new Set(userIds);
    await Promise.allSettled(
      [...this.clients]
        .filter((client) => recipients.has(client.userId))
        .map((client) => this.checkAndSend(client, conversationId)),
    );
  }
  closeSession(sessionHash: string) {
    for (const client of this.clients) if (client.sessionHash === sessionHash) client.subscriber.complete();
  }
  closeUser(userId: string) {
    for (const client of this.clients) if (client.userId === userId) client.subscriber.complete();
  }
  closeAll() {
    for (const client of this.clients) client.subscriber.complete();
  }
  onModuleDestroy() {
    this.closeAll();
    this.stopHeartbeat();
  }
}
