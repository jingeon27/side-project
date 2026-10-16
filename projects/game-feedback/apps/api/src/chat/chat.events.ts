import { Observable, type Subscriber } from 'rxjs';
import { Inject, Injectable, type MessageEvent, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';
import type { SessionRequest } from '../auth/session.types';
import { ApiError } from '../common/http/api-error';
import { APP_CONFIG, type AppConfig } from '../config/app.config';

type Client = { userId: string; sessionHash: string; subscriber: Subscriber<MessageEvent> };

/** Per-process invalidation stream. Private content is always fetched through authenticated REST. */
@Injectable()
export class ChatEvents implements OnModuleDestroy {
  private readonly clients = new Set<Client>();
  canAccess: (userId: string, conversationId: string) => Promise<boolean> = async () => false;
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async authenticated(client: Client): Promise<boolean> {
    const session = await this.db.session.findUnique({
      where: { tokenHash: client.sessionHash },
      include: { user: true },
    });
    return (
      !!session?.user &&
      session.userId === client.userId &&
      session.expiresAt.getTime() > Date.now() &&
      (this.config.demoMode || !session.user.demoKey)
    );
  }
  stream(req: SessionRequest): Observable<MessageEvent> {
    const session = req.gfSession;
    if (!session?.user) throw new ApiError(401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
    return new Observable((subscriber) => {
      const client: Client = { userId: session.user!.id, sessionHash: session.tokenHash, subscriber };
      const existing = [...this.clients].filter((item) => item.sessionHash === client.sessionHash);
      if (existing.length >= 4) existing[0].subscriber.complete();
      this.clients.add(client);
      // Reconnection always refreshes the complete list, covering events missed while disconnected.
      void this.checkAndSend(client, null);
      const heartbeat = setInterval(() => {
        void this.authenticated(client)
          .then((valid) => {
            if (!valid) subscriber.complete();
            else if (!subscriber.closed) subscriber.next({ type: 'heartbeat', data: {} });
          })
          .catch(() => subscriber.complete());
      }, 5000);
      heartbeat.unref();
      return () => {
        clearInterval(heartbeat);
        this.clients.delete(client);
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
  }
}
