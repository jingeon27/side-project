import { Inject, Injectable } from '@nestjs/common';

import { ApiError } from '../../common/http/api-error';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { PrismaClient, type Prisma } from '../../generated/prisma';
import { hiddenUserIds } from '../../users/visibility/hidden-users';
import { conversationInclude, type ConversationRow } from '../chat.presenter';
import { ChatEvents } from '../events/chat.events';

@Injectable()
export class ChatAccessService {
  constructor(
    @Inject(PrismaClient) private readonly db: PrismaClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(ChatEvents) private readonly events: ChatEvents,
  ) {
    events.canAccess = async (userId, id) => {
      try {
        await this.visible(userId, id);
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.getStatus() < 500) return false;
        throw error;
      }
    };
  }
  excluded(userId: string) {
    return hiddenUserIds(this.db, this.config, userId);
  }
  async listWhere(userId: string, excluded?: string[]): Promise<Prisma.ChatConversationWhereInput> {
    const hidden = excluded ?? (await this.excluded(userId));
    return {
      ...(!this.config.demoMode && !this.config.testAuthEnabled
        ? { firstUser: { demoKey: null }, secondUser: { demoKey: null } }
        : {}),
      OR: [
        { firstUserId: userId, firstHidden: false },
        { secondUserId: userId, secondHidden: false },
      ],
      AND: [
        {
          OR: [
            { support: { isNot: null } },
            {
              firstUserId: { notIn: hidden },
              secondUserId: { notIn: hidden },
              firstUser: { bannedAt: null },
              secondUser: { bannedAt: null },
            },
          ],
        },
      ],
    };
  }
  async blocked(userId: string, peerId: string, db: Prisma.TransactionClient | undefined = undefined) {
    return !!(await (db ?? this.db).block.findFirst({
      where: {
        OR: [
          { userId, blockedUserId: peerId },
          { userId: peerId, blockedUserId: userId },
        ],
      },
      select: { id: true },
    }));
  }
  async visible(
    userId: string,
    id: string,
    db: Prisma.TransactionClient | undefined = undefined,
  ): Promise<ConversationRow> {
    const row = await (db ?? this.db).chatConversation.findFirst({
      where: { id, OR: [{ firstUserId: userId }, { secondUserId: userId }] },
      include: conversationInclude,
    });
    if (!row) throw new ApiError(404, 'CONVERSATION_NOT_FOUND', '대화를 찾을 수 없습니다.');
    const peer = row.firstUserId === userId ? row.secondUser : row.firstUser;
    if (!row.support && (row.firstUser.bannedAt || row.secondUser.bannedAt))
      throw new ApiError(403, 'USER_BANNED', '이용이 제한된 계정입니다. 관리자 문의를 이용해주세요.');
    if (
      (!this.config.demoMode && !this.config.testAuthEnabled && peer.demoKey) ||
      (!row.support && (await this.blocked(userId, peer.id, db)))
    ) {
      throw new ApiError(404, 'CONVERSATION_NOT_FOUND', '대화를 찾을 수 없습니다.');
    }
    return row;
  }
}
