import { Injectable } from '@nestjs/common';

import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import { recordEvent } from '../analytics/analytics-event.writer';
import type { IViewer } from '../auth/session.service';
import { randomToken } from '../common/crypto';
import { fail } from '../common/errors';
import { Database } from '../database/database.service';
import { UnitOfWork } from '../database/unit-of-work';
import { GROUP_ROLE, isOwner } from './group-role';
import { GroupService } from './group.service';
import { MembershipService } from './membership.service';

@Injectable()
export class GroupAdministrationService {
  constructor(
    private readonly db: Database,
    private readonly transactions: UnitOfWork,
    private readonly membership: MembershipService,
    private readonly groups: GroupService,
  ) {}

  async setModerator(viewer: IViewer, groupId: string, userId: string, enabled: boolean) {
    const eventId = randomToken();
    await this.transactions.atomic(async (tx) => {
      await this.membership.requireOwner(viewer.id, groupId, tx);
      const member = await this.membership.requireMember(userId, groupId, tx);
      if (isOwner(member)) fail('그룹장의 역할은 관리자 양도로만 변경할 수 있습니다.');
      const role = enabled ? GROUP_ROLE.MODERATOR : GROUP_ROLE.MEMBER;
      if (member.role === role) return;
      await (tx ?? this.db).groupMember.update({
        where: { groupId_userId: { groupId, userId } },
        data: { role },
      });
      await recordEvent(tx ?? this.db, {
        id: `moderator:${eventId}`,
        type: ANALYTICS_EVENT.GROUP_MODERATOR_CHANGED,
        userId: viewer.id,
        properties: { groupId, targetUserId: userId, enabled },
      });
    });
    return this.groups.group(viewer, groupId);
  }

  async transferOwnership(viewer: IViewer, groupId: string, userId: string) {
    const eventId = randomToken();
    await this.transactions.atomic(async (tx) => {
      await this.membership.requireOwner(viewer.id, groupId, tx);
      if (viewer.id === userId) fail('다른 멤버에게 관리자 권한을 양도해 주세요.');
      const member = await this.membership.requireMember(userId, groupId, tx);
      if (isOwner(member)) fail('이미 그룹장인 멤버입니다.');
      await (tx ?? this.db).groupMember.update({
        where: { groupId_userId: { groupId, userId: viewer.id } },
        data: { role: GROUP_ROLE.MEMBER },
      });
      await (tx ?? this.db).groupMember.update({
        where: { groupId_userId: { groupId, userId } },
        data: { role: GROUP_ROLE.OWNER },
      });
      await recordEvent(tx ?? this.db, {
        id: `ownership:${eventId}`,
        type: ANALYTICS_EVENT.GROUP_OWNERSHIP_TRANSFERRED,
        userId: viewer.id,
        properties: { groupId, previousOwnerId: viewer.id, ownerId: userId },
      });
    });
    return this.groups.group(viewer, groupId);
  }
}
