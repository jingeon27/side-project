import { Database, type TDatabaseClient } from '../database/database.service';

import { Injectable } from '@nestjs/common';

import type { Contest, GroupMember, Submission } from '../../generated/prisma';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import { isAdmin, isOwner } from './group-role';
import { GROUP_VISIBILITY, toGroupVisibility } from './group-visibility';

export interface IContestAccess {
  contest: Contest;
  member: GroupMember;
}

export interface ISubmissionAccess extends IContestAccess {
  submission: Submission;
  admin: boolean;
}

interface IAccessOptions {
  /** 그룹 관리자만 허용한다. */
  owner?: boolean;
  /** 트랜잭션 안에서 확인할 때 넘긴다. */
  client?: TDatabaseClient;
}

/** 공개 Post 읽기와 멤버 전용 쓰기·기존 대회 접근을 구분한다. */
@Injectable()
export class MembershipService {
  constructor(private readonly db: Database) {}

  /** 여러 그룹을 합친 조회도 멤버십 범위를 먼저 고정한다. */
  async memberGroupIds(userId: string): Promise<string[]> {
    const memberships = await this.db.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });
    return memberships.map(({ groupId }) => groupId);
  }

  async requireMember(userId: string, groupId: string, client?: TDatabaseClient): Promise<GroupMember> {
    const member = await (client ?? this.db).groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!member) fail(ERROR_MESSAGE.GROUP_FORBIDDEN, ERROR_CODE.FORBIDDEN);
    return member;
  }

  async requireOwner(userId: string, groupId: string, client?: TDatabaseClient): Promise<GroupMember> {
    const member = await this.requireMember(userId, groupId, client);
    if (!isOwner(member)) fail(ERROR_MESSAGE.GROUP_FORBIDDEN, ERROR_CODE.FORBIDDEN);
    return member;
  }

  async requireAdmin(userId: string, groupId: string, client?: TDatabaseClient): Promise<GroupMember> {
    const member = await this.requireMember(userId, groupId, client);
    if (!isAdmin(member)) fail(ERROR_MESSAGE.GROUP_FORBIDDEN, ERROR_CODE.FORBIDDEN);
    return member;
  }

  async readableGroup(userId: string | null, groupId: string, client?: TDatabaseClient) {
    const group = await (client ?? this.db).group.findUnique({ where: { id: groupId } });
    if (!group) fail('그룹을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
    const member = userId
      ? await (client ?? this.db).groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } })
      : null;
    if (toGroupVisibility(group.visibility) === GROUP_VISIBILITY.PRIVATE && !member) {
      if (!userId) fail(ERROR_MESSAGE.LOGIN_REQUIRED, ERROR_CODE.UNAUTHENTICATED);
      fail(ERROR_MESSAGE.GROUP_FORBIDDEN, ERROR_CODE.FORBIDDEN);
    }
    return { group, member };
  }

  async readablePost(userId: string | null, postId: string, client?: TDatabaseClient) {
    const post = await (client ?? this.db).post.findUnique({
      where: { id: postId },
      include: {
        upload: true,
        legacySubmission: {
          select: { hidden: true },
        },
      },
    });
    if (!post) fail('게시물을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
    const { member } = await this.readableGroup(userId, post.groupId, client);
    const admin = member ? isAdmin(member) : false;
    if ((post.hidden || post.legacySubmission?.hidden) && !admin)
      fail('게시물을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
    return { post, admin };
  }

  async accessiblePost(userId: string, postId: string, client?: TDatabaseClient) {
    const post = await (client ?? this.db).post.findUnique({
      where: { id: postId },
      include: { upload: true, legacySubmission: { select: { hidden: true } } },
    });
    if (!post) fail('게시물을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
    const member = await this.requireMember(userId, post.groupId, client);
    const admin = isAdmin(member);
    if ((post.hidden || post.legacySubmission?.hidden) && !admin)
      fail('게시물을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
    return { post, admin };
  }

  /** 대회가 없으면 NOT_FOUND, 그룹 멤버(owner면 관리자)가 아니면 FORBIDDEN */
  async accessibleContest(
    userId: string,
    contestId: string,
    { owner = false, client }: IAccessOptions = {},
  ): Promise<IContestAccess> {
    const contest = await (client ?? this.db).contest.findUnique({ where: { id: contestId } });
    if (!contest || contest.format !== 'LEGACY') fail(ERROR_MESSAGE.CONTEST_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    const member = owner
      ? await this.requireAdmin(userId, contest.groupId, client)
      : await this.requireMember(userId, contest.groupId, client);
    return { contest, member };
  }

  /** 사진이 없으면 NOT_FOUND, 멤버가 아니면 FORBIDDEN, 숨긴 사진은 관리자가 아니면 NOT_FOUND */
  async accessibleSubmission(
    userId: string,
    submissionId: string,
    { owner = false, client }: IAccessOptions = {},
  ): Promise<ISubmissionAccess> {
    const found = await (client ?? this.db).submission.findUnique({
      where: { id: submissionId },
      include: { contest: true },
    });
    if (!found) fail(ERROR_MESSAGE.SUBMISSION_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    const { contest, ...submission } = found;
    const member = owner
      ? await this.requireAdmin(userId, contest.groupId, client)
      : await this.requireMember(userId, contest.groupId, client);
    const admin = isAdmin(member);
    if (submission.hidden && !admin) fail(ERROR_MESSAGE.SUBMISSION_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    return { submission, contest, member, admin };
  }
}
