import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { Request } from 'express';

import {
  ExpoPushTransport,
  PushDispatcher,
  type IPushJob,
  type IPushJobUpdate,
  type IPushMessage,
} from '@side/push-notifications';

import { SessionService } from '../auth/session.service';
import { ERROR_CODE, fail } from '../common/errors';
import { mobilePushSettings } from '../config/env';
import { PUSH_DEVICE_LIMIT, PUSH_INTERVAL_MS, PUSH_QUEUE_BATCH_SIZE } from '../config/limits';
import { Database } from '../database/database.service';
import { NotificationService } from '../notification/notification.service';
import type { RegisterPushDeviceDto } from './push.dto';

@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private readonly logger = new Logger(PushService.name);

  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  onModuleInit() {
    if (!mobilePushSettings().enabled) return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = this.runOnce()
        .catch(() => {
          this.logger.warn('푸시 큐 처리에 실패했습니다.');
        })
        .finally(() => {
          this.running = undefined;
        });
    }, PUSH_INTERVAL_MS);
    this.timer.unref();
  }
  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.running;
  }

  async register(req: Request, input: RegisterPushDeviceDto) {
    const { userId, key } = await this.sessions.requireSessionKey(req);
    await this.db.atomic(async (tx) => {
      const previous = await tx.pushDevice.findUnique({ where: { id: input.installationId } });
      const rebound = previous && (previous.userId !== userId || previous.sessionKey !== key);
      if (rebound) await tx.pushDevice.delete({ where: { id: previous.id } });
      await tx.pushDevice.deleteMany({ where: { token: input.token, id: { not: input.installationId } } });
      if ((!previous || rebound) && (await tx.pushDevice.count({ where: { userId } })) >= PUSH_DEVICE_LIMIT)
        fail('등록된 알림 기기가 너무 많습니다.', ERROR_CODE.RATE_LIMITED);
      const data = {
        token: input.token,
        userId,
        sessionKey: key,
        platform: input.platform,
        locale: input.locale,
        enabled: true,
      };
      await tx.pushDevice.upsert({
        where: { id: input.installationId },
        create: { id: input.installationId, ...data },
        update: data,
      });
    });
    return { ok: true, enabled: mobilePushSettings().enabled };
  }

  async unregister(req: Request, installationId: string) {
    const { userId, key } = await this.sessions.requireSessionKey(req);
    await this.db.pushDevice.deleteMany({ where: { id: installationId, userId, sessionKey: key } });
    return { ok: true };
  }

  async runOnce(
    transport = new ExpoPushTransport({ accessToken: mobilePushSettings().accessToken }),
    now = new Date(),
  ) {
    const dispatcher = new PushDispatcher(
      {
        due: (date) =>
          this.db.pushDelivery.findMany({
            where: {
              status: { in: ['PENDING', 'TICKET'] },
              nextAttemptAt: { lte: date },
              OR: [{ leaseUntil: null }, { leaseUntil: { lte: date } }],
            },
            orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
            take: PUSH_QUEUE_BATCH_SIZE,
          }),
        claim: async (id, lease, date, until) =>
          !!(
            await this.db.pushDelivery.updateMany({
              where: {
                id,
                status: { in: ['PENDING', 'TICKET'] },
                OR: [{ leaseUntil: null }, { leaseUntil: { lte: date } }],
              },
              data: { leaseToken: lease, leaseUntil: until },
            })
          ).count,
        finish: (id, lease, update) => this.finish(id, lease, update),
        disable: async (id) => {
          await this.db.pushDevice.updateMany({ where: { id }, data: { enabled: false } });
        },
        prepare: (job) => this.prepare(job),
      },
      transport,
    );
    await dispatcher.run(now);
    await this.db.pushDelivery.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - 2 * 86_400_000) } },
    });
    await this.db.pushDevice.deleteMany({ where: { session: { expiresAt: { lte: now } } } });
  }

  private async finish(id: string, lease: string, update: IPushJobUpdate) {
    await this.db.pushDelivery.updateMany({
      where: { id, leaseToken: lease },
      data: { ...update, leaseUntil: null, leaseToken: null },
    });
  }

  private async prepare(job: IPushJob): Promise<IPushMessage | null> {
    const device = await this.db.pushDevice.findFirst({
      where: {
        id: job.deviceId,
        enabled: true,
        user: { needsOnboarding: false },
        session: { expiresAt: { gt: new Date() } },
      },
      include: { session: { select: { userId: true } } },
    });
    if (!device || device.session.userId !== device.userId) return null;
    const status = await this.notifications.pushStatus(
      device.userId,
      job.eventId.replace(/^notification:/, ''),
    );
    if (!status) return null;
    return {
      to: device.token,
      title: '웃긴순간',
      body: '새로운 알림이 도착했어요.',
      data: { path: '/notifications', notificationId: job.eventId },
      badge: status.badge,
      sound: 'default',
      channelId: 'activity',
    };
  }
}
