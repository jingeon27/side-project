import { Injectable } from '@nestjs/common';

import { ANALYTICS_EVENT, recordEvent } from '../analytics/analytics-event';
import type { IViewer } from '../auth/session.service';
import { USER_VIEW_SELECT } from '../auth/user-view';
import { ERROR_CODE, fail } from '../common/errors';
import { pageRange } from '../common/validation';
import { PAGE_SIZE_DEFAULT } from '../config/limits';
import { Database } from '../database/database.service';
import { MembershipService } from './membership.service';

@Injectable()
export class GroupJoinRequestService {
  constructor(
    private readonly db: Database,
    private readonly membership: MembershipService,
  ) {}

  async list(viewer: IViewer, groupId: string, offset?: number | null, limit?: number | null) {
    const range = pageRange(offset ?? 0, limit ?? PAGE_SIZE_DEFAULT);
    await this.membership.requireOwner(viewer.id, groupId);
    return this.db.groupJoinRequest.findMany({
      where: { groupId },
      include: { user: { select: USER_VIEW_SELECT } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: range.offset,
      take: range.limit,
    });
  }

  async review(viewer: IViewer, requestId: string, approved: boolean) {
    return this.db.atomic(async (tx) => {
      const request = await tx.groupJoinRequest.findUnique({ where: { id: requestId } });
      if (!request) fail('가입 신청을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
      await this.membership.requireOwner(viewer.id, request.groupId, tx);
      if (approved) {
        await tx.groupMember.createMany({
          data: [{ groupId: request.groupId, userId: request.userId }],
          skipDuplicates: true,
        });
        await recordEvent(tx, {
          id: `joined:${request.groupId}:${request.userId}`,
          type: ANALYTICS_EVENT.GROUP_JOINED,
          userId: request.userId,
          properties: { groupId: request.groupId },
        });
      }
      await tx.groupJoinRequest.delete({ where: { id: requestId } });
      return true;
    });
  }
}
