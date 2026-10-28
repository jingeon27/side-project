import { Injectable } from '@nestjs/common';

import type { Contest } from '../../generated/prisma';
import { CLEANUP_BATCH_SIZE, NOTIFICATION_FANOUT_BATCH_SIZE } from '../config/limits';
import { Database } from '../database/database.service';
import { UnitOfWork } from '../database/unit-of-work';
import { reportUnexpectedError } from '../monitoring/sentry';
import { notificationRetryDelayMs } from './contest-notification.policy';
import { NOTIFICATION_TYPE, type TNotificationType } from './notification-type';
import { writeNotifications } from './notification.writer';

interface IFailure {
  failures: number;
  retryAt: number;
}

@Injectable()
export class ContestNotificationService {
  // 실패한 대회는 이 프로세스에서 점점 늦춰 다시 시도한다. 앞선 대회 하나가 매번 실패해도 뒤 대회의 알림은 나간다.
  private readonly failures = new Map<string, IFailure>();

  constructor(
    private readonly db: Database,
    private readonly transactions: UnitOfWork,
  ) {}

  /** @returns 이번 주기에 처리를 시도한 대회 수 */
  async sendDue(now = new Date()) {
    const waiting = [...this.failures].filter(([, failure]) => failure.retryAt > now.getTime());
    const contests = await this.db.contest.findMany({
      where: {
        id: { notIn: waiting.map(([id]) => id) },
        OR: [
          { startNotifiedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
          { endNotifiedAt: null, endsAt: { lte: now } },
        ],
      },
      select: { id: true },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take: CLEANUP_BATCH_SIZE,
    });
    for (const { id } of contests) {
      try {
        await this.notify(id, now);
        this.failures.delete(id);
      } catch (error) {
        const failures = (this.failures.get(id)?.failures ?? 0) + 1;
        this.failures.set(id, { failures, retryAt: now.getTime() + notificationRetryDelayMs(failures) });
        reportUnexpectedError(error, { job: 'contest-notification', failures: String(failures) });
      }
    }
    return contests.length;
  }

  /**
   * 멤버 알림을 묶음마다 짧은 트랜잭션으로 먼저 쓰고, 모두 쓴 뒤에 대회에 보낸 시각을 남긴다.
   * (userId, eventKey) unique와 skipDuplicates 덕분에 중간에 실패해 다시 실행하거나 여러 인스턴스가 함께 돌아도 한 번씩만 남는다.
   */
  private async notify(id: string, now: Date) {
    const contest = await this.db.contest.findUnique({ where: { id } });
    if (!contest) return;
    const ended = contest.endsAt <= now;
    if (ended ? contest.endNotifiedAt : contest.startNotifiedAt) return;
    const type = ended ? NOTIFICATION_TYPE.CONTEST_ENDED : NOTIFICATION_TYPE.CONTEST_STARTED;
    await this.fanOut(contest, type, ended ? contest.endsAt : now, null);
    // 늦게 처리한 종료 대회에는 시작 알림을 따로 보내지 않는다.
    await this.transactions.run([
      ...(ended
        ? [this.db.contest.updateMany({ where: { id, endNotifiedAt: null }, data: { endNotifiedAt: now } })]
        : []),
      this.db.contest.updateMany({ where: { id, startNotifiedAt: null }, data: { startNotifiedAt: now } }),
    ]);
  }

  private async fanOut(contest: Contest, type: TNotificationType, joinedBy: Date, after: string | null) {
    const members = await this.db.groupMember.findMany({
      where: {
        groupId: contest.groupId,
        joinedAt: { lte: joinedBy },
        ...(after ? { userId: { gt: after } } : {}),
      },
      select: { userId: true },
      orderBy: { userId: 'asc' },
      take: NOTIFICATION_FANOUT_BATCH_SIZE,
    });
    if (!members.length) return;
    await this.transactions.run((tx) =>
      writeNotifications(
        tx,
        members.map(({ userId }) => ({
          userId,
          groupId: contest.groupId,
          contestId: contest.id,
          type,
          eventKey: `${type}:${contest.id}`,
        })),
      ),
    );
    const last = members.at(-1);
    if (members.length === NOTIFICATION_FANOUT_BATCH_SIZE && last)
      await this.fanOut(contest, type, joinedBy, last.userId);
  }
}
