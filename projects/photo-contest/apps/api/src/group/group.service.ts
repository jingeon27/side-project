import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { groupBy, keyBy, mapValues, uniq } from 'es-toolkit';

import type { Group, GroupCategory, Prisma } from '../../generated/prisma';
import { ANALYTICS_EVENT } from '../analytics/analytics-event';
import { recordEvent } from '../analytics/analytics-event.writer';
import type { IViewer } from '../auth/session.service';
import { USER_VIEW_SELECT, type IUserView } from '../auth/user-view';
import { siblingLoader } from '../common/batch';
import { randomToken, sha256Hex } from '../common/crypto';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import { pageRange, textValue } from '../common/validation';
import {
  GROUP_CONTEST_HISTORY,
  GROUP_DESCRIPTION_LIMIT,
  LEADERBOARD_LIMIT,
  PAGE_SIZE_DEFAULT,
  TEXT_LIMIT,
} from '../config/limits';
import { CONTEST_FORMAT } from '../contest/group-contest.policy';
import { Database } from '../database/database.service';
import { UnitOfWork } from '../database/unit-of-work';
import { GroupCategoryService } from './group-category.service';
import { GROUP_ROLE, toGroupRole, type TGroupRole } from './group-role';
import { GROUP_VISIBILITY, toGroupVisibility, type TGroupVisibility } from './group-visibility';
import { buildLeaderboard, type ILeaderboardEntry } from './leaderboard';
import { MembershipService } from './membership.service';

const groupCount = { _count: { select: { members: true } } } as const;

function viewerGroupInclude(viewer: IViewer | null) {
  const userId = { in: viewer ? [viewer.id] : [] };
  return {
    ...groupCount,
    members: { where: { userId }, select: { role: true } },
    joinRequests: { where: { userId }, select: { id: true } },
  } satisfies Prisma.GroupInclude;
}

export interface IMemberView {
  user: IUserView;
  role: TGroupRole;
}

/** GraphQL Group. members·contests·leaderboard는 선택될 때만 필드 리졸버가 불러온다. */
export interface IGroupNode {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  /** 조회한 사용자의 역할 */
  role: TGroupRole | null;
  visibility: TGroupVisibility;
  memberCount: number;
  canViewPosts: boolean;
  joinRequestPending: boolean;
  inviteToken: string | null;
  /** 같은 목록(myGroups)의 그룹들과 한 번에 불러온다. */
  loadMembers: () => Promise<IMemberView[]>;
  /** 게시물을 볼 수 있는 그룹만, 같은 목록의 그룹들과 한 번에 불러온다. */
  loadCategories: () => Promise<GroupCategory[]>;
}

export interface IInvitePreview {
  groupName: string;
  memberCount: number;
  ownerNickname: string;
  joinedGroupId: string | null;
  visibility: TGroupVisibility;
  joinRequestPending: boolean;
}

interface IGroupWithRole {
  group: Group & { _count: { members: number } };
  role: string | null;
  joinRequestPending?: boolean;
}

/** 공개 그룹이거나 승인된 멤버면 게시물·카테고리를 볼 수 있다. */
function canViewPosts({ group, role }: IGroupWithRole) {
  return group.visibility === GROUP_VISIBILITY.PUBLIC || Boolean(role);
}

@Injectable()
export class GroupService {
  constructor(
    private readonly db: Database,
    private readonly transactions: UnitOfWork,
    private readonly membership: MembershipService,
    private readonly categories: GroupCategoryService,
  ) {}

  async myGroups(viewer: IViewer): Promise<IGroupNode[]> {
    const memberships = await this.db.groupMember.findMany({
      where: { userId: viewer.id },
      include: { group: { include: groupCount } },
      orderBy: [{ joinedAt: 'desc' }, { groupId: 'asc' }],
    });
    return this.toNodes(memberships);
  }

  async group(viewer: IViewer | null, groupId: string): Promise<IGroupNode> {
    const group = await this.db.group.findUnique({
      where: { id: groupId },
      include: viewerGroupInclude(viewer),
    });
    if (!group) fail('그룹을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
    return this.toNode({
      group,
      role: group.members[0]?.role ?? null,
      joinRequestPending: group.joinRequests.length > 0,
    });
  }

  async discoverGroups(
    viewer: IViewer | null,
    query: {
      search?: string | null;
      visibility?: TGroupVisibility | null;
      offset?: number | null;
      limit?: number | null;
    },
  ): Promise<IGroupNode[]> {
    const range = pageRange(query.offset ?? 0, query.limit ?? PAGE_SIZE_DEFAULT);
    const search = query.search?.trim() ?? '';
    if (search.length > TEXT_LIMIT.GROUP_NAME) fail('검색어는 40자 이하로 입력해 주세요.');
    const groups = await this.db.group.findMany({
      where: {
        ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
        ...(query.visibility ? { visibility: query.visibility } : {}),
      },
      include: viewerGroupInclude(viewer),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: range.offset,
      take: range.limit,
    });
    return this.toNodes(
      groups.map((group) => ({
        group,
        role: group.members[0]?.role ?? null,
        joinRequestPending: group.joinRequests.length > 0,
      })),
    );
  }

  publicGroupCount() {
    return this.db.group.count({ where: { visibility: GROUP_VISIBILITY.PUBLIC } });
  }

  async createGroup(
    viewer: IViewer,
    name: unknown,
    visibility: TGroupVisibility = GROUP_VISIBILITY.PUBLIC,
    description?: string | null,
  ): Promise<IGroupNode> {
    const validName = textValue(name, TEXT_LIMIT.GROUP_NAME, '그룹 이름');
    const validDescription = description?.trim() ?? '';
    if (validDescription.length > GROUP_DESCRIPTION_LIMIT) fail('그룹 소개는 500자 이하로 입력해 주세요.');
    const inviteToken = randomToken();
    const group = await this.transactions.atomic(async (tx) => {
      const created = await (tx ?? this.db).group.create({
        data: {
          // nullable 복합 avatar FK가 기본 id 생성을 덮지 않도록 명시한다.
          id: randomUUID(),
          name: validName,
          description: validDescription,
          visibility,
          inviteToken,
          inviteHash: sha256Hex(inviteToken),
          members: {
            create: { userId: viewer.id, role: GROUP_ROLE.OWNER },
          },
        },
        include: groupCount,
      });
      await recordEvent(tx ?? this.db, {
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
    return this.requestMembership(viewer, group.id);
  }

  async requestMembership(viewer: IViewer, groupId: string): Promise<IGroupNode> {
    await this.transactions.atomic(async (tx) => {
      const group = await (tx ?? this.db).group.findUnique({ where: { id: groupId } });
      if (!group) fail('그룹을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
      const existing = await (tx ?? this.db).groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: viewer.id } },
      });
      if (existing) return;
      if (toGroupVisibility(group.visibility) === GROUP_VISIBILITY.PRIVATE) {
        await (tx ?? this.db).groupJoinRequest.createMany({
          data: [{ groupId, userId: viewer.id }],
          skipDuplicates: true,
        });
        return;
      }
      // 같은 사용자의 동시 가입도 PK로 한 행만 남긴다.
      await (tx ?? this.db).groupMember.createMany({
        data: [{ groupId: group.id, userId: viewer.id }],
        skipDuplicates: true,
      });
      await recordEvent(tx ?? this.db, {
        id: `joined:${group.id}:${viewer.id}`,
        type: ANALYTICS_EVENT.GROUP_JOINED,
        userId: viewer.id,
        properties: { groupId: group.id },
      });
      await (tx ?? this.db).groupJoinRequest.deleteMany({ where: { groupId, userId: viewer.id } });
    });
    return this.group(viewer, groupId);
  }

  /** 관리자만. 이전 토큰은 가입·미리보기 모두 NOT_FOUND가 된다. */
  async regenerateInviteLink(viewer: IViewer, groupId: string): Promise<IGroupNode> {
    const member = await this.membership.requireOwner(viewer.id, groupId);
    const inviteToken = randomToken();
    const group = await this.db.group.update({
      where: { id: groupId },
      data: { inviteToken, inviteHash: sha256Hex(inviteToken) },
      include: groupCount,
    });
    return this.toNode({ group, role: member.role });
  }

  /** 로그인하지 않아도 볼 수 있다. joinedGroupId는 로그인한 멤버에게만 준다. */
  async invitePreview(viewer: IViewer | null, token: unknown): Promise<IInvitePreview> {
    const group = await this.groupByInvite(token);
    const [memberCount, owner, membership, pending] = await Promise.all([
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
      viewer
        ? this.db.groupJoinRequest.findUnique({
            where: { groupId_userId: { groupId: group.id, userId: viewer.id } },
          })
        : null,
    ]);
    return {
      groupName: group.name,
      memberCount,
      ownerNickname: owner?.user.nickname ?? '',
      joinedGroupId: membership ? group.id : null,
      visibility: toGroupVisibility(group.visibility),
      joinRequestPending: Boolean(pending),
    };
  }

  /**
   * 최근 종료된(endsAt <= now) 기존 대회 50개의 숨기지 않은 사진만 집계해 상위 100명을 돌려준다.
   * 표·좋아요 수는 DB가 세고, 작성자는 순위에 오른 사람만 따로 읽는다.
   */
  async leaderboard(groupId: string, now = new Date()): Promise<ILeaderboardEntry<IUserView>[]> {
    const contests = await this.db.contest.findMany({
      where: { groupId, format: CONTEST_FORMAT.LEGACY, endsAt: { lte: now } },
      select: { id: true },
      orderBy: [{ endsAt: 'desc' }, { id: 'desc' }],
      take: GROUP_CONTEST_HISTORY,
    });
    if (!contests.length) return [];
    const rows = await this.db.submission.findMany({
      where: { hidden: false, contestId: { in: contests.map(({ id }) => id) } },
      select: { contestId: true, authorId: true, _count: { select: { votes: true, likes: true } } },
    });
    const users = keyBy(
      await this.db.user.findMany({
        where: { id: { in: uniq(rows.map((row) => row.authorId)) } },
        select: USER_VIEW_SELECT,
      }),
      (user) => user.id,
    );
    const entries = buildLeaderboard(
      rows.flatMap((row) => {
        const user = users[row.authorId];
        if (!user) return [];
        return [{ contestId: row.contestId, user, voteCount: row._count.votes, likeCount: row._count.likes }];
      }),
    );
    return entries.slice(0, LEADERBOARD_LIMIT);
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
    const membersByGroup = mapValues(
      groupBy(rows, (row) => row.groupId),
      (members) => members.map((member) => ({ user: member.user, role: toGroupRole(member.role) })),
    );
    return new Map(Object.entries(membersByGroup));
  }

  private toNode(row: IGroupWithRole): IGroupNode {
    return this.toNodes([row])[0] ?? fail('그룹을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
  }

  private toNodes(rows: readonly IGroupWithRole[]): IGroupNode[] {
    const loaders = { members: this.membersLoader(rows), categories: this.categoriesLoader(rows) };
    return rows.map((row) => this.node(row, loaders));
  }

  private membersLoader(rows: readonly IGroupWithRole[]) {
    return siblingLoader(
      rows.map((row) => row.group.id),
      (ids) => this.membersOf(ids),
      [],
    );
  }

  // 익명 discoverGroups(limit 48)에서도 그룹마다 카테고리를 따로 조회하지 않도록 목록 단위로 묶는다.
  private categoriesLoader(rows: readonly IGroupWithRole[]) {
    return siblingLoader(
      rows.filter(canViewPosts).map((row) => row.group.id),
      (ids) => this.categories.activeOf(ids),
      [],
    );
  }

  private node(
    row: IGroupWithRole,
    loaders: {
      members: (groupId: string) => Promise<IMemberView[]>;
      categories: (groupId: string) => Promise<GroupCategory[]>;
    },
  ): IGroupNode {
    const { group, role, joinRequestPending = false } = row;
    const viewable = canViewPosts(row);
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      avatarUrl: group.avatarId ? `/backend/groups/${group.id}/avatar/${group.avatarId}` : null,
      role: role ? toGroupRole(role) : null,
      visibility: toGroupVisibility(group.visibility),
      memberCount: group._count.members,
      canViewPosts: viewable,
      joinRequestPending,
      inviteToken: role ? group.inviteToken : null,
      loadMembers: () => (role ? loaders.members(group.id) : Promise.resolve([])),
      loadCategories: () => (viewable ? loaders.categories(group.id) : Promise.resolve([])),
    };
  }
}
