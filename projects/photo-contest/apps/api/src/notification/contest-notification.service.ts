import { Injectable } from '@nestjs/common';

import { CLEANUP_BATCH_SIZE } from '../config/limits';
import { Database } from '../database/database.service';
import { UnitOfWork } from '../database/unit-of-work';
import { NOTIFICATION_TYPE } from './notification-type';
import { writeNotifications } from './notification.writer';

@Injectable()
export class ContestNotificationService {
  constructor(
    private readonly db: Database,
    private readonly transactions: UnitOfWork,
  ) {}

  async sendDue(now = new Date()) {
    const contests = await this.db.contest.findMany({
      where: {
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
      await this.transactions.atomic(async (tx) => {
        const contest = await tx.contest.findUnique({ where: { id } });
        if (!contest) return;
        const ended = contest.endsAt <= now;
        if (ended ? contest.endNotifiedAt : contest.startNotifiedAt) return;
        const type = ended ? NOTIFICATION_TYPE.CONTEST_ENDED : NOTIFICATION_TYPE.CONTEST_STARTED;
        const members = await tx.groupMember.findMany({
          where: { groupId: contest.groupId, joinedAt: { lte: ended ? contest.endsAt : now } },
          select: { userId: true },
        });
        await writeNotifications(
          tx,
          members.map(({ userId }) => ({
            userId,
            groupId: contest.groupId,
            contestId: id,
            type,
            eventKey: `${type}:${id}`,
          })),
        );
        await tx.contest.update({
          where: { id },
          data: ended
            ? { endNotifiedAt: now, startNotifiedAt: contest.startNotifiedAt ?? now }
            : { startNotifiedAt: now },
        });
      });
    }
    return contests.length;
  }
}
