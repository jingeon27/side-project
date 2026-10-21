import { Inject, Injectable } from '@nestjs/common';

import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { activeCommentWhere } from '../comments/comment-visibility';
import { ACTIVE_POST } from '../common/content';
import { ApiError } from '../common/http/api-error';
import type { ListQueryDto } from '../common/http/list-query.dto';
import { decodeCursor, encodeCursor } from '../common/pagination';
import { PrismaClient, type Prisma } from '../generated/prisma';
import { UserVisibilityService } from '../users/user-visibility.service';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
  ) {}
  async notifications(req: SessionRequest, query: ListQueryDto) {
    const u = requireUser(req),
      q = query,
      cursor = decodeCursor(q.cursor),
      excluded = await this.visibility.excluded(req);
    const visible: Prisma.NotificationWhereInput = {
      AND: [
        { OR: [{ actorId: null }, { actorId: { notIn: excluded } }] },
        { OR: [{ commentId: null }, { comment: { is: activeCommentWhere(excluded) } }] },
      ],
    };
    const where: Prisma.NotificationWhereInput = {
      AND: [visible],
      userId: u.id,
      post: { ...ACTIVE_POST, authorId: { notIn: excluded } },
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    };
    const [rows, unreadCount] = await Promise.all([
      this.db.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: q.limit + 1,
      }),
      this.db.notification.count({
        where: {
          AND: [visible],
          userId: u.id,
          readAt: null,
          post: { ...ACTIVE_POST, authorId: { notIn: excluded } },
        },
      }),
    ]);
    const items = rows.slice(0, q.limit);
    return {
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        postId: n.postId,
        answerId: n.answerId,
        commentId: n.commentId,
        message: n.message,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount,
      nextCursor: rows.length > q.limit ? encodeCursor(items[items.length - 1]) : null,
    };
  }
  async readNotification(req: SessionRequest, id?: string) {
    const u = requireUser(req);
    const result = await this.db.notification.updateMany({
      where: { userId: u.id, ...(id ? { id } : {}), readAt: null },
      data: { readAt: new Date() },
    });
    if (id && !result.count && !(await this.db.notification.findFirst({ where: { id, userId: u.id } })))
      throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', '알림을 찾을 수 없습니다.');
    return { ok: true };
  }
}
