import { Injectable } from '@nestjs/common';

import type { Contest, GroupMember, Submission } from '../../generated/prisma';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import { Database, type TDatabaseClient } from '../database/database.service';
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

const POST_NOT_FOUND = '게시물을 찾을 수 없습니다.';

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

  /**
   * 그룹 메타데이터는 탐색에 공개되므로 그룹 ID로 묻는 조회는 비공개 그룹이면 UNAUTHENTICATED·FORBIDDEN으로 가입을 안내한다.
   * 게시물·대회처럼 하위 리소스 ID로 묻는 조회는 concealAs를 넘겨, 비멤버(비로그인 포함)에게 그 ID가 있는지 숨긴다.
   */
  async readableGroup(userId: string | null, groupId: string, client?: TDatabaseClient, concealAs?: string) {
    const group = await (client ?? this.db).group.findUnique({ where: { id: groupId } });
    if (!group) fail(concealAs ?? '그룹을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
    const member = userId
      ? await (client ?? this.db).groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } })
      : null;
    if (toGroupVisibility(group.visibility) === GROUP_VISIBILITY.PRIVATE && !member) {
      if (concealAs) fail(concealAs, ERROR_CODE.NOT_FOUND);
      if (!userId) fail(ERROR_MESSAGE.LOGIN_REQUIRED, ERROR_CODE.UNAUTHENTICATED);
      fail(ERROR_MESSAGE.GROUP_FORBIDDEN, ERROR_CODE.FORBIDDEN);
    }
    return { group, member };
  }

  /**
   * 하위 리소스에 쓰기·반응할 멤버인지 확인한다. 비공개 그룹이면 비멤버에게 리소스가 있는지 숨기고(NOT_FOUND),
   * 내용이 공개인 공개 그룹이면 FORBIDDEN으로 가입이 필요하다고 알린다.
   */
  async requireMemberOf(
    userId: string,
    groupId: string,
    notFound: string,
    client?: TDatabaseClient,
  ): Promise<GroupMember> {
    const member = await (client ?? this.db).groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (member) return member;
    const group = await (client ?? this.db).group.findUnique({
      where: { id: groupId },
      select: { visibility: true },
    });
    if (!group || toGroupVisibility(group.visibility) === GROUP_VISIBILITY.PRIVATE)
      fail(notFound, ERROR_CODE.NOT_FOUND);
    return fail(ERROR_MESSAGE.GROUP_FORBIDDEN, ERROR_CODE.FORBIDDEN);
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
    if (!post) fail(POST_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    const { member } = await this.readableGroup(userId, post.groupId, client, POST_NOT_FOUND);
    const admin = member ? isAdmin(member) : false;
    if ((post.hidden || post.legacySubmission?.hidden) && !admin) fail(POST_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    return { post, admin, member };
  }

  async accessiblePost(userId: string, postId: string, client?: TDatabaseClient) {
    const post = await (client ?? this.db).post.findUnique({
      where: { id: postId },
      include: { upload: true, legacySubmission: { select: { hidden: true } } },
    });
    if (!post) fail(POST_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    const member = await this.requireMemberOf(userId, post.groupId, POST_NOT_FOUND, client);
    const admin = isAdmin(member);
    if ((post.hidden || post.legacySubmission?.hidden) && !admin) fail(POST_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    return { post, admin };
  }

  /**
   * 기존 대회는 공개 그룹이어도 멤버 전용이라 비멤버에게는 대회가 없는 것과 같이 NOT_FOUND다.
   * 멤버이지만 관리자 전용(owner) 동작이면 FORBIDDEN.
   */
  async accessibleContest(
    userId: string,
    contestId: string,
    { owner = false, client }: IAccessOptions = {},
  ): Promise<IContestAccess> {
    const contest = await (client ?? this.db).contest.findUnique({ where: { id: contestId } });
    if (!contest || contest.format !== 'LEGACY') fail(ERROR_MESSAGE.CONTEST_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    const member = await this.memberOrNotFound(
      userId,
      contest.groupId,
      ERROR_MESSAGE.CONTEST_NOT_FOUND,
      client,
    );
    if (owner && !isAdmin(member)) fail(ERROR_MESSAGE.GROUP_FORBIDDEN, ERROR_CODE.FORBIDDEN);
    return { contest, member };
  }

  /** 사진이 없거나 멤버가 아니면 NOT_FOUND, 관리자 전용 동작에 관리자가 아니면 FORBIDDEN, 숨긴 사진은 관리자가 아니면 NOT_FOUND */
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
    const member = await this.memberOrNotFound(
      userId,
      contest.groupId,
      ERROR_MESSAGE.SUBMISSION_NOT_FOUND,
      client,
    );
    if (owner && !isAdmin(member)) fail(ERROR_MESSAGE.GROUP_FORBIDDEN, ERROR_CODE.FORBIDDEN);
    const admin = isAdmin(member);
    if (submission.hidden && !admin) fail(ERROR_MESSAGE.SUBMISSION_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    return { submission, contest, member, admin };
  }

  private async memberOrNotFound(
    userId: string,
    groupId: string,
    notFound: string,
    client?: TDatabaseClient,
  ) {
    const member = await (client ?? this.db).groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!member) fail(notFound, ERROR_CODE.NOT_FOUND);
    return member;
  }
}
