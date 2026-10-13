import { Injectable } from '@nestjs/common';

import type { Group } from '../../generated/prisma';
import { ANALYTICS_EVENT, recordEvent } from '../analytics/analytics-event';
import type { IViewer } from '../auth/session.service';
import { USER_VIEW_SELECT } from '../auth/user-view';
import type { IUserView } from '../auth/user-view';
import { groupBy, siblingLoader } from '../common/batch';
import { randomToken, sha256Hex } from '../common/crypto';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import { textValue } from '../common/validation';
import { TEXT_LIMIT } from '../config/limits';
import { Database } from '../database/database.service';
import { GROUP_ROLE, toGroupRole } from './group-role';
import type { TGroupRole } from './group-role';
import { buildLeaderboard } from './leaderboard';
import type { ILeaderboardEntry } from './leaderboard';
import { MembershipService } from './membership.service';

export interface IMemberView {
  user: IUserView;
  role: TGroupRole;
}

/** GraphQL Group. members·contests·leaderboard는 선택될 때만 필드 리졸버가 불러온다. */
export interface IGroupNode {
  id: string;
  name: string;
  /** 조회한 사용자의 역할 */
  role: TGroupRole;
  inviteToken: string;
  /** 같은 목록(myGroups)의 그룹들과 한 번에 불러온다. */
  loadMembers: () => Promise<IMemberView[]>;
}

export interface IInvitePreview {
  groupName: string;
  memberCount: number;
  ownerNickname: string;
  joinedGroupId: string | null;
}

interface IGroupWithRole {
  group: Group;
  role: string;
}

@Injectable()
export class GroupService {
  constructor(
    private readonly db: Database,
    private readonly membership: MembershipService,
  ) {}

  async myGroups(viewer: IViewer): Promise<IGroupNode[]> {
    const memberships = await this.db.groupMember.findMany({
      where: { userId: viewer.id },
      include: { group: true },
      orderBy: [{ joinedAt: 'desc' }, { groupId: 'asc' }],
    });
    return this.toNodes(memberships);
  }

  /** 멤버가 아니면(그룹이 없어도) FORBIDDEN */
  async group(viewer: IViewer, groupId: string): Promise<IGroupNode> {
    const membership = await this.db.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: viewer.id } },
      include: { group: true },
    });
    if (!membership) fail(ERROR_MESSAGE.GROUP_FORBIDDEN, ERROR_CODE.FORBIDDEN);
    return this.toNode(membership);
  }

  async createGroup(viewer: IViewer, name: unknown): Promise<IGroupNode> {
    const validName = textValue(name, TEXT_LIMIT.GROUP_NAME, '그룹 이름');
    const inviteToken = randomToken();
    const group = await this.db.atomic(async (tx) => {
      const created = await tx.group.create({
        data: {
          name: validName,
          inviteToken,
          inviteHash: sha256Hex(inviteToken),
          members: { create: { userId: viewer.id, role: GROUP_ROLE.OWNER } },
        },
      });
      await recordEvent(tx, {
        id: `group:${created.id}`,
        type: ANALYTICS_EVENT.GROUP_CREATED,
        userId: viewer.id,
        properties: { groupId: created.id },
      });
      return created;
    });
    return this.toNode({ group, role: GROUP_ROLE.OWNER });
  }

  /** 이미 멤버면 역할을 바꾸지 않고 그대로 돌려준다. */
  async joinGroup(viewer: IViewer, token: unknown): Promise<IGroupNode> {
    const group = await this.groupByInvite(token);
    const member = await this.db.atomic(async (tx) => {
      // 같은 사용자의 동시 가입도 PK로 한 행만 남긴다.
      await tx.groupMember.createMany({
        data: [{ groupId: group.id, userId: viewer.id }],
        skipDuplicates: true,
      });
      await recordEvent(tx, {
        id: `joined:${group.id}:${viewer.id}`,
        type: ANALYTICS_EVENT.GROUP_JOINED,
        userId: viewer.id,
        properties: { groupId: group.id },
      });
      return tx.groupMember.findUniqueOrThrow({
        where: { groupId_userId: { groupId: group.id, userId: viewer.id } },
      });
    });
    return this.toNode({ group, role: member.role });
  }

  /** 관리자만. 이전 토큰은 가입·미리보기 모두 NOT_FOUND가 된다. */
  async regenerateInviteLink(viewer: IViewer, groupId: string): Promise<IGroupNode> {
    const member = await this.membership.requireOwner(viewer.id, groupId);
    const inviteToken = randomToken();
    const group = await this.db.group.update({
      where: { id: groupId },
      data: { inviteToken, inviteHash: sha256Hex(inviteToken) },
    });
    return this.toNode({ group, role: member.role });
  }

  /** 로그인하지 않아도 볼 수 있다. joinedGroupId는 로그인한 멤버에게만 준다. */
  async invitePreview(viewer: IViewer | null, token: unknown): Promise<IInvitePreview> {
    const group = await this.groupByInvite(token);
    const [memberCount, owner, membership] = await Promise.all([
      this.db.groupMember.count({ where: { groupId: group.id } }),
      this.db.groupMember.findFirst({
        where: { groupId: group.id, role: GROUP_ROLE.OWNER },
        orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
        select: { user: { select: { nickname: true } } },
      }),
      viewer
        ? this.db.groupMember.findUnique({
            where: { groupId_userId: { groupId: group.id, userId: viewer.id } },
          })
        : null,
    ]);
    return {
      groupName: group.name,
      memberCount,
      ownerNickname: owner?.user.nickname ?? '',
      joinedGroupId: membership ? group.id : null,
    };
  }

  /** 종료된 대회(endsAt <= now)의 숨기지 않은 사진만 집계한다. */
  async leaderboard(groupId: string, now = new Date()): Promise<ILeaderboardEntry<IUserView>[]> {
    const rows = await this.db.submission.findMany({
      where: { hidden: false, contest: { groupId, endsAt: { lte: now } } },
      select: {
        contestId: true,
        author: { select: USER_VIEW_SELECT },
        _count: { select: { votes: true, likes: true } },
      },
    });
    return buildLeaderboard(
      rows.map((row) => ({
        contestId: row.contestId,
        user: row.author,
        voteCount: row._count.votes,
        likeCount: row._count.likes,
      })),
    );
  }

  private async groupByInvite(token: unknown) {
    const value = textValue(token, TEXT_LIMIT.INVITE_TOKEN, '초대 코드');
    const group = await this.db.group.findUnique({ where: { inviteHash: sha256Hex(value) } });
    if (!group) fail(ERROR_MESSAGE.INVALID_INVITE, ERROR_CODE.NOT_FOUND);
    return group;
  }

  private async membersOf(groupIds: readonly string[]): Promise<Map<string, IMemberView[]>> {
    const rows = await this.db.groupMember.findMany({
      where: { groupId: { in: [...groupIds] } },
      select: { groupId: true, role: true, user: { select: USER_VIEW_SELECT } },
      orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
    });
    const grouped = groupBy(rows, (row) => row.groupId);
    return new Map(
      [...grouped].map(([groupId, members]) => [
        groupId,
        members.map((member) => ({ user: member.user, role: toGroupRole(member.role) })),
      ]),
    );
  }

  private toNode(row: IGroupWithRole): IGroupNode {
    return this.node(row, this.membersLoader([row]));
  }

  private toNodes(rows: readonly IGroupWithRole[]): IGroupNode[] {
    const loadMembers = this.membersLoader(rows);
    return rows.map((row) => this.node(row, loadMembers));
  }

  private membersLoader(rows: readonly IGroupWithRole[]) {
    return siblingLoader(
      rows.map((row) => row.group.id),
      (ids) => this.membersOf(ids),
      [],
    );
  }

  private node(
    { group, role }: IGroupWithRole,
    loadMembers: (groupId: string) => Promise<IMemberView[]>,
  ): IGroupNode {
    return {
      id: group.id,
      name: group.name,
      role: toGroupRole(role),
      inviteToken: group.inviteToken,
      loadMembers: () => loadMembers(group.id),
    };
  }
}
