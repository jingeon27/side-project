import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import dayjs from 'dayjs';
import { match } from 'ts-pattern';

import {
  ExpoPushTransport,
  PushDispatcher,
  type IPushJob,
  type IPushJobUpdate,
  type IPushMessage,
} from '@side/toolkit/push-notifications';

import { requireUser } from '../auth/session/session-access';
import type { SessionRequest } from '../auth/session/session.types';
import { ApiError } from '../common/http/api-error';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { PrismaClient } from '../generated/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { type TRegisterPushDeviceDto } from './push.dto';

const PUSH_DEVICE_LIMIT = 10;
const PUSH_INTERVAL_MS = 15_000;
const PUSH_QUEUE_BATCH_SIZE = 100;

@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private readonly logger = new Logger(PushService.name);

  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit() {
    if (!this.config.mobilePush.enabled) return;
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

  async register(req: SessionRequest, input: TRegisterPushDeviceDto) {
    const userId = requireUser(req).id;
    const key = req.gfSession?.id;
    if (!key) throw new ApiError(401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
    await this.db.$transaction(async (tx) => {
      const previous = await tx.pushDevice.findUnique({ where: { id: input.installationId } });
      const rebound = previous && (previous.userId !== userId || previous.sessionKey !== key);
      if (rebound) await tx.pushDevice.delete({ where: { id: previous.id } });
      await tx.pushDevice.deleteMany({ where: { token: input.token, id: { not: input.installationId } } });
      if ((!previous || rebound) && (await tx.pushDevice.count({ where: { userId } })) >= PUSH_DEVICE_LIMIT)
        throw new ApiError(429, 'TOO_MANY_DEVICES', '등록된 알림 기기가 너무 많습니다.');
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
    return { ok: true, enabled: this.config.mobilePush.enabled };
  }

  async unregister(req: SessionRequest, installationId: string) {
    const userId = requireUser(req).id;
    const key = req.gfSession?.id;
    if (!key) throw new ApiError(401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
    await this.db.pushDevice.deleteMany({ where: { id: installationId, userId, sessionKey: key } });
    return { ok: true };
  }

  async runOnce(
    transport = new ExpoPushTransport({ accessToken: this.config.mobilePush.accessToken }),
    now = dayjs().toDate(),
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
                nextAttemptAt: { lte: date },
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
      where: { createdAt: { lt: dayjs(now.getTime() - 2 * 86_400_000).toDate() } },
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
        user: { bannedAt: null, withdrawnAt: null },
        session: { expiresAt: { gt: dayjs().toDate() } },
      },
      include: { session: { select: { userId: true } } },
    });
    if (!device || device.session.userId !== device.userId) return null;
    const status = await this.notifications.pushStatus(device.userId, job.eventId);
    if (!status) return null;
    // 기기 언어는 DB 문자열이라 모르는 값은 한국어 문구를 쓴다.
    const copy = match(device.locale)
      .with('en', () => ({ title: 'New activity', body: 'You have a new notification.' }))
      .with('ja', () => ({ title: '新しいお知らせ', body: '新しいお知らせが届きました。' }))
      .otherwise(() => ({ title: '새 알림', body: '새로운 알림이 도착했어요.' }));
    return {
      to: device.token,
      ...copy,
      data: { path: `/${device.locale}/notifications`, notificationId: job.eventId },
      badge: Math.min(9999, status.badge),
      sound: 'default',
      channelId: 'activity',
    };
  }
}
