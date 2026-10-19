import { NotificationsRepository } from './notifications.repository';
import type { ListQueryDto } from '../common/http/list-query.dto';
import { ACTIVE_POST } from '../common/content';
import { decodeCursor, encodeCursor } from '../common/pagination';
import { UserVisibilityService } from '../users/user-visibility.service';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import type { SessionRequest } from '../auth/session.types';
import { requireUser } from '../auth/session-access';
import { ApiError } from '../common/http/api-error';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(NotificationsRepository) private readonly repository: NotificationsRepository,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
  ) {}
  async notifications(req: SessionRequest, query: ListQueryDto) {
    const u = requireUser(req),
      q = query,
      cursor = decodeCursor(q.cursor),
      excluded = await this.visibility.excluded(req);
    const visible: Prisma.NotificationWhereInput = {
      OR: [{ actorId: null }, { actorId: { notIn: excluded } }],
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
      this.repository.findManyNotification({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: q.limit + 1,
      }),
      this.repository.countNotification({
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
    const result = await this.repository.updateManyNotification({
      where: { userId: u.id, ...(id ? { id } : {}), readAt: null },
      data: { readAt: new Date() },
    });
    if (
      id &&
      !result.count &&
      !(await this.repository.findFirstNotification({ where: { id, userId: u.id } }))
    )
      throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', '알림을 찾을 수 없습니다.');
    return { ok: true };
  }
}
