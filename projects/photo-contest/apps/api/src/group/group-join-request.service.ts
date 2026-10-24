import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import { recordEvent } from '../analytics/analytics-event.writer';
import type { IViewer } from '../auth/session.service';
import { USER_VIEW_SELECT } from '../auth/user-view';
import { ERROR_CODE, fail } from '../common/errors';
import { pageRange } from '../common/validation';
import { PAGE_SIZE_DEFAULT } from '../config/limits';
import { Database } from '../database/database.service';
import { UnitOfWork } from '../database/unit-of-work';
import { MembershipService } from './membership.service';

@Injectable()
export class GroupJoinRequestService {
  constructor(
    private readonly db: Database,
    private readonly transactions: UnitOfWork,
    private readonly membership: MembershipService,
  ) {}

  async list(viewer: IViewer, groupId: string, offset?: number | null, limit?: number | null) {
    const range = pageRange(offset ?? 0, limit ?? PAGE_SIZE_DEFAULT);
    await this.membership.requireAdmin(viewer.id, groupId);
    return this.db.groupJoinRequest.findMany({
      where: { groupId },
      include: { user: { select: USER_VIEW_SELECT } },
      orderBy: [
        {
          createdAt: 'asc',
        },
        { id: 'asc' },
      ],
      skip: range.offset,
      take: range.limit,
    });
  }

  async review(viewer: IViewer, requestId: string, approved: boolean) {
    return this.transactions.atomic(async (tx) => {
      const request = await (tx ?? this.db).groupJoinRequest.findUnique({
        where: {
          id: requestId,
        },
      });
      if (!request) fail('가입 신청을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
      await this.membership.requireAdmin(viewer.id, request.groupId, tx);
      const joined = approved
        ? await (tx ?? this.db).groupMember.createMany({
            data: [{ groupId: request.groupId, userId: request.userId }],
            skipDuplicates: true,
          })
        : { count: 0 };
      // 나갔다가 다시 승인받을 수 있으므로 실제로 가입한 경우에만 새 id로 기록한다.
      if (joined.count === 1) {
        await recordEvent(tx ?? this.db, {
          id: `joined:${request.groupId}:${request.userId}:${randomUUID()}`,
          type: ANALYTICS_EVENT.GROUP_JOINED,
          userId: request.userId,
          properties: { groupId: request.groupId },
        });
      }
      await (tx ?? this.db).groupJoinRequest.delete({ where: { id: requestId } });
      return true;
    });
  }
}
