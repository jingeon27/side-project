import { Inject, Injectable } from '@nestjs/common';
import { uniq } from 'es-toolkit';

import { requireUser } from '../auth/session-access';
import type { SessionRequest } from '../auth/session.types';
import { ChatAccessService } from '../chat/chat-access.service';
import { activeCommentWhere } from '../comments/comment-visibility';
import { ACTIVE_POST } from '../common/content';
import { ApiError } from '../common/http/api-error';
import type { ListQueryDto } from '../common/http/list-query.dto';
import { decodeCursor, nextCursor } from '../common/pagination';
import { PrismaClient, type Prisma } from '../generated/prisma';
import { UserVisibilityService } from '../users/user-visibility.service';
import { authorDto, authorSelect } from '../users/user.presenter';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(UserVisibilityService) private readonly visibility: UserVisibilityService,
    @Inject(ChatAccessService) private readonly chat: ChatAccessService,
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
    const chatVisible: Prisma.ChatNotificationWhereInput = {
      userId: u.id,
      message: { conversation: await this.chat.listWhere(u.id) },
    };
    const chatWhere: Prisma.ChatNotificationWhereInput = {
      AND: [chatVisible],
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    };
    const [postRows, chatRows, postUnread, chatUnread] = await Promise.all([
      this.db.notification.findMany({
        where,
        include: { post: { select: { title: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: q.limit + 1,
      }),
      this.db.chatNotification.findMany({
        where: chatWhere,
        include: { message: { select: { conversationId: true, senderId: true } } },
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
      this.db.chatNotification.count({ where: { AND: [chatVisible], readAt: null } }),
    ]);
    const rows = [
      ...postRows.map((row) => ({
        id: row.id,
        type: row.type,
        actorId: row.actorId,
        postId: row.postId,
        postTitle: row.post.title,
        answerId: row.answerId,
        commentId: row.commentId,
        conversationId: undefined,
        readAt: row.readAt,
        createdAt: row.createdAt,
      })),
      ...chatRows.map((row) => ({
        id: row.id,
        type: 'CHAT_MESSAGE' as const,
        actorId: row.message.senderId,
        postId: null,
        postTitle: null,
        answerId: null,
        commentId: null,
        conversationId: row.message.conversationId,
        readAt: row.readAt,
        createdAt: row.createdAt,
      })),
    ].sort(
      (left, right) =>
        right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id),
    );
    const items = rows.slice(0, q.limit);
    // 문구는 저장하지 않는다. 현재 닉네임·제목을 한 번에 읽어 클라이언트가 번역 문구로 조합하게 한다.
    const actorIds = uniq(items.flatMap((n) => (n.actorId ? [n.actorId] : [])));
    const actors = actorIds.length
      ? await this.db.user.findMany({ where: { id: { in: actorIds } }, select: authorSelect })
      : [];
    const actorById = new Map(actors.map((actor) => [actor.id, authorDto(actor)]));
    return {
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        postId: n.postId,
        answerId: n.answerId,
        commentId: n.commentId,
        ...(n.conversationId ? { conversationId: n.conversationId } : {}),
        actor: (n.actorId && actorById.get(n.actorId)) || null,
        postTitle: n.postTitle,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount: postUnread + chatUnread,
      nextCursor: nextCursor(rows, q.limit),
    };
  }
  async readNotification(req: SessionRequest, id?: string) {
    const u = requireUser(req);
    const where = { userId: u.id, ...(id ? { id } : {}), readAt: null };
    const data = { readAt: new Date() };
    const results = await this.db.$transaction([
      this.db.notification.updateMany({ where, data }),
      this.db.chatNotification.updateMany({ where, data }),
    ]);
    if (
      id &&
      !results.some(({ count }) => count) &&
      !(await this.db.notification.findFirst({ where: { id, userId: u.id } })) &&
      !(await this.db.chatNotification.findFirst({ where: { id, userId: u.id } }))
    )
      throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', '알림을 찾을 수 없습니다.');
    return { ok: true };
  }
}
