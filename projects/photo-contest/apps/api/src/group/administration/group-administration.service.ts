import { Injectable } from '@nestjs/common';

import { ANALYTICS_EVENT } from '../../analytics/analytics-event';
import { recordEvent } from '../../analytics/analytics-event.writer';
import type { IViewer } from '../../auth/session/session.service';
import { randomToken } from '../../common/crypto';
import { ERROR_CODE, fail } from '../../common/errors';
import { Database } from '../../database/database.service';
import { UnitOfWork } from '../../database/unit-of-work';
import { GroupService } from '../group.service';
import { GROUP_ROLE, isOwner, toGroupRole } from '../membership/group-role';
import { MembershipService } from '../membership/membership.service';

const MESSAGE = {
  REMOVE_SELF: '내가 나가려면 그룹 나가기를 사용해 주세요.',
  MEMBER_NOT_FOUND: '그룹 멤버를 찾을 수 없습니다.',
  REMOVE_OWNER: '그룹장은 내보낼 수 없습니다.',
  MODERATOR_REMOVES_MEMBERS_ONLY: '부관리자는 일반 멤버만 내보낼 수 있습니다.',
  OWNER_CANNOT_LEAVE: '그룹장은 다른 멤버에게 관리자를 양도한 뒤 나갈 수 있습니다.',
} as const satisfies Record<string, string>;

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

  /**
   * 관리자가 멤버를 내보낸다. 그룹장은 내보낼 수 없고 부관리자는 일반 멤버만, 그룹장은 부관리자도 내보낸다.
   * 남긴 게시물·댓글은 그룹의 기록이라 지우지 않는다. 비공개 그룹이면 다시 들어오려면 승인을 받아야 한다.
   */
  async removeMember(viewer: IViewer, groupId: string, userId: string) {
    const eventId = randomToken();
    await this.transactions.atomic(async (tx) => {
      const actor = await this.membership.requireAdmin(viewer.id, groupId, tx);
      if (viewer.id === userId) fail(MESSAGE.REMOVE_SELF);
      const target = await tx.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
      if (!target) fail(MESSAGE.MEMBER_NOT_FOUND, ERROR_CODE.NOT_FOUND);
      if (isOwner(target)) fail(MESSAGE.REMOVE_OWNER, ERROR_CODE.FORBIDDEN);
      if (!isOwner(actor) && toGroupRole(target.role) !== GROUP_ROLE.MEMBER)
        fail(MESSAGE.MODERATOR_REMOVES_MEMBERS_ONLY, ERROR_CODE.FORBIDDEN);
      await tx.groupMember.delete({ where: { groupId_userId: { groupId, userId } } });
      await recordEvent(tx, {
        id: `member-removed:${eventId}`,
        type: ANALYTICS_EVENT.GROUP_MEMBER_REMOVED,
        userId: viewer.id,
        properties: { groupId, targetUserId: userId },
      });
    });
    return this.groups.group(viewer, groupId);
  }

  /** 본인이 그룹을 나간다. 그룹장은 관리자를 양도한 뒤에만 나갈 수 있다. */
  async leave(viewer: IViewer, groupId: string) {
    const eventId = randomToken();
    await this.transactions.atomic(async (tx) => {
      const member = await this.membership.requireMember(viewer.id, groupId, tx);
      if (isOwner(member)) fail(MESSAGE.OWNER_CANNOT_LEAVE);
      await tx.groupMember.delete({ where: { groupId_userId: { groupId, userId: viewer.id } } });
      await recordEvent(tx, {
        id: `left:${eventId}`,
        type: ANALYTICS_EVENT.GROUP_LEFT,
        userId: viewer.id,
        properties: { groupId },
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
