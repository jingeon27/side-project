import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { Prisma } from '../../generated/prisma';
import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import { recordEvent } from '../analytics/analytics-event.writer';
import type { IViewer } from '../auth/session.service';
import { ERROR_CODE, fail } from '../common/errors';
import { pageRange } from '../common/validation';
import { Database } from '../database/database.service';
import { MembershipService } from '../group/membership.service';
import { NOTIFICATION_TYPE } from './notification-type';

@Injectable()
export class NotificationService {
  constructor(
    private readonly db: Database,
    private readonly membership: MembershipService,
  ) {}

  private async visible(userId: string): Promise<Prisma.NotificationWhereInput> {
    const [groupIds, adminGroupIds] = await Promise.all([
      this.membership.memberGroupIds(userId),
      this.membership.memberGroupIds(userId, true),
    ]);
    return {
      userId,
      OR: [
        { type: { in: [NOTIFICATION_TYPE.JOIN_APPROVED, NOTIFICATION_TYPE.JOIN_REJECTED] } },
        {
          type: NOTIFICATION_TYPE.JOIN_REQUESTED,
          groupId: { in: adminGroupIds },
          joinRequest: { isNot: null },
        },
        {
          groupId: { in: groupIds },
          OR: [
            {
              type: { in: [NOTIFICATION_TYPE.POST_COMMENT, NOTIFICATION_TYPE.COMMENT_REPLY] },
              post: {
                hidden: false,
                OR: [{ legacySubmission: null }, { legacySubmission: { hidden: false } }],
              },
              comment: { isNot: null },
            },
            {
              type: { in: [NOTIFICATION_TYPE.CONTEST_STARTED, NOTIFICATION_TYPE.CONTEST_ENDED] },
              contest: { isNot: null },
            },
          ],
        },
      ],
    };
  }

  async list(viewer: IViewer, offset?: number | null, limit?: number | null) {
    const range = pageRange(offset ?? 0, limit ?? 20);
    const where = await this.visible(viewer.id);
    const [rows, unreadCount] = await Promise.all([
      this.db.notification.findMany({
        where,
        include: {
          actor: { select: { nickname: true } },
          group: { select: { name: true } },
          post: { select: { title: true } },
          comment: { select: { parentId: true } },
          contest: { select: { title: true, format: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: range.offset,
        take: range.limit + 1,
      }),
      this.db.notification.count({ where: { AND: [where], readAt: null } }),
    ]);
    return {
      items: rows.slice(0, range.limit).map((row) => ({
        id: row.id,
        type: row.type,
        groupId: row.groupId,
        groupName: row.group.name,
        postId: row.postId,
        postTitle: row.post?.title ?? null,
        commentId: row.commentId,
        parentCommentId: row.comment?.parentId ?? null,
        contestId: row.contestId,
        contestTitle: row.contest?.title ?? null,
        contestFormat: row.contest?.format ?? null,
        joinRequestId: row.joinRequestId,
        actorNickname: row.actor?.nickname ?? null,
        readAt: row.readAt,
        createdAt: row.createdAt,
      })),
      unreadCount,
      hasMore: rows.length > range.limit,
    };
  }

  async unreadCount(viewer: IViewer) {
    return this.db.notification.count({ where: { AND: [await this.visible(viewer.id)], readAt: null } });
  }

  async read(viewer: IViewer, id?: string) {
    return this.db.atomic(async (tx) => {
      const updated = await tx.notification.updateMany({
        where: { userId: viewer.id, ...(id ? { id } : {}), readAt: null },
        data: { readAt: new Date() },
      });
      if (
        id &&
        !updated.count &&
        !(await tx.notification.findFirst({ where: { id, userId: viewer.id }, select: { id: true } }))
      ) {
        fail('알림을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
      }
      if (updated.count)
        await recordEvent(tx, {
          id: `notification-read:${randomUUID()}`,
          type: ANALYTICS_EVENT.NOTIFICATION_READ,
          userId: viewer.id,
          properties: { notificationId: id ?? null, count: updated.count },
        });
      return true;
    });
  }
}
