import { Injectable } from '@nestjs/common';

import type { IViewer } from '../auth/session.service';
import { fail } from '../common/errors';
import { UnitOfWork } from '../database/unit-of-work';
import { GROUP_ROLE, isOwner } from './group-role';
import { GroupRepository } from './group.repository';
import { GroupService } from './group.service';
import { MembershipService } from './membership.service';

@Injectable()
export class GroupAdministrationService {
  constructor(
    private readonly repository: GroupRepository,
    private readonly transactions: UnitOfWork,
    private readonly membership: MembershipService,
    private readonly groups: GroupService,
  ) {}

  async setModerator(viewer: IViewer, groupId: string, userId: string, enabled: boolean) {
    await this.transactions.atomic(async (tx) => {
      await this.membership.requireOwner(viewer.id, groupId, tx);
      const member = await this.membership.requireMember(userId, groupId, tx);
      if (isOwner(member)) fail('그룹장의 역할은 관리자 양도로만 변경할 수 있습니다.');
      await this.repository.updateGroupMember(
        {
          where: { groupId_userId: { groupId, userId } },
          data: { role: enabled ? GROUP_ROLE.MODERATOR : GROUP_ROLE.MEMBER },
        },
        tx,
      );
    });
    return this.groups.group(viewer, groupId);
  }

  async transferOwnership(viewer: IViewer, groupId: string, userId: string) {
    await this.transactions.atomic(async (tx) => {
      await this.membership.requireOwner(viewer.id, groupId, tx);
      if (viewer.id === userId) fail('다른 멤버에게 관리자 권한을 양도해 주세요.');
      const member = await this.membership.requireMember(userId, groupId, tx);
      if (isOwner(member)) fail('이미 그룹장인 멤버입니다.');
      await this.repository.updateGroupMember(
        { where: { groupId_userId: { groupId, userId: viewer.id } }, data: { role: GROUP_ROLE.MEMBER } },
        tx,
      );
      await this.repository.updateGroupMember(
        { where: { groupId_userId: { groupId, userId } }, data: { role: GROUP_ROLE.OWNER } },
        tx,
      );
    });
    return this.groups.group(viewer, groupId);
  }
}
