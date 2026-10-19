import { UnitOfWork } from '../database/unit-of-work';
import { GroupRepository } from './group.repository';
import { Injectable } from '@nestjs/common';

import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import type { IViewer } from '../auth/session.service';
import { USER_VIEW_SELECT } from '../auth/user-view';
import { ERROR_CODE, fail } from '../common/errors';
import { pageRange } from '../common/validation';
import { PAGE_SIZE_DEFAULT } from '../config/limits';
import { MembershipService } from './membership.service';

@Injectable()
export class GroupJoinRequestService {
  constructor(
    private readonly repository: GroupRepository,
    private readonly transactions: UnitOfWork,
    private readonly membership: MembershipService,
  ) {}

  async list(viewer: IViewer, groupId: string, offset?: number | null, limit?: number | null) {
    const range = pageRange(offset ?? 0, limit ?? PAGE_SIZE_DEFAULT);
    await this.membership.requireOwner(viewer.id, groupId);
    return this.repository.findManyGroupJoinRequest({
      where: { groupId },
      include: { user: { select: USER_VIEW_SELECT } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: range.offset,
      take: range.limit,
    });
  }

  async review(viewer: IViewer, requestId: string, approved: boolean) {
    return this.transactions.atomic(async (tx) => {
      const request = await this.repository.findUniqueGroupJoinRequest({ where: { id: requestId } }, tx);
      if (!request) fail('가입 신청을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
      await this.membership.requireOwner(viewer.id, request.groupId, tx);
      if (approved) {
        await this.repository.createManyGroupMember(
          {
            data: [{ groupId: request.groupId, userId: request.userId }],
            skipDuplicates: true,
          },
          tx,
        );
        await this.repository.recordEvent(tx, {
          id: `joined:${request.groupId}:${request.userId}`,
          type: ANALYTICS_EVENT.GROUP_JOINED,
          userId: request.userId,
          properties: { groupId: request.groupId },
        });
      }
      await this.repository.deleteGroupJoinRequest({ where: { id: requestId } }, tx);
      return true;
    });
  }
}
