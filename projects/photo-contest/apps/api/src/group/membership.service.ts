import { GroupRepository } from './group.repository';
import { Injectable } from '@nestjs/common';

import type { Contest, GroupMember, Submission } from '../../generated/prisma';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import type { TDatabaseClient } from '../database/database.service';
import { isOwner } from './group-role';
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
  constructor(private readonly repository: GroupRepository) {}

  /** 여러 그룹을 합친 조회도 멤버십 범위를 먼저 고정한다. */
  async memberGroupIds(userId: string): Promise<string[]> {
    const memberships = await this.repository.findManyGroupMember({
      where: { userId },
      select: { groupId: true },
    });
    return memberships.map(({ groupId }) => groupId);
  }

  async requireMember(userId: string, groupId: string, client?: TDatabaseClient): Promise<GroupMember> {
    const member = await this.repository.findUniqueGroupMember(
      { where: { groupId_userId: { groupId, userId } } },
      client,
    );
    if (!member) fail(ERROR_MESSAGE.GROUP_FORBIDDEN, ERROR_CODE.FORBIDDEN);
    return member;
  }

  async requireOwner(userId: string, groupId: string, client?: TDatabaseClient): Promise<GroupMember> {
    const member = await this.requireMember(userId, groupId, client);
    if (!isOwner(member)) fail(ERROR_MESSAGE.GROUP_FORBIDDEN, ERROR_CODE.FORBIDDEN);
    return member;
  }

  async readableGroup(userId: string | null, groupId: string, client?: TDatabaseClient) {
    const group = await this.repository.findUniqueGroup({ where: { id: groupId } }, client);
    if (!group) fail('그룹을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
    const member = userId
      ? await this.repository.findUniqueGroupMember(
          { where: { groupId_userId: { groupId, userId } } },
          client,
        )
      : null;
    if (toGroupVisibility(group.visibility) === GROUP_VISIBILITY.PRIVATE && !member) {
      if (!userId) fail(ERROR_MESSAGE.LOGIN_REQUIRED, ERROR_CODE.UNAUTHENTICATED);
      fail(ERROR_MESSAGE.GROUP_FORBIDDEN, ERROR_CODE.FORBIDDEN);
    }
    return { group, member };
  }

  async readablePost(userId: string | null, postId: string, client?: TDatabaseClient) {
    const post = await this.repository.findUniquePost(
      {
        where: { id: postId },
        include: { upload: true, legacySubmission: { select: { hidden: true } } },
      },
      client,
    );
    if (!post) fail('게시물을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
    const { member } = await this.readableGroup(userId, post.groupId, client);
    const admin = member ? isOwner(member) : false;
    if ((post.hidden || post.legacySubmission?.hidden) && !admin)
      fail('게시물을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
    return { post, admin };
  }

  async accessiblePost(userId: string, postId: string, client?: TDatabaseClient) {
    const post = await this.repository.findUniquePost(
      {
        where: { id: postId },
        include: { upload: true, legacySubmission: { select: { hidden: true } } },
      },
      client,
    );
    if (!post) fail('게시물을 찾을 수 없습니다.', ERROR_CODE.NOT_FOUND);
    const member = await this.requireMember(userId, post.groupId, client);
    const admin = isOwner(member);
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
    const contest = await this.repository.findUniqueContest({ where: { id: contestId } }, client);
    if (!contest) fail(ERROR_MESSAGE.CONTEST_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    const member = owner
      ? await this.requireOwner(userId, contest.groupId, client)
      : await this.requireMember(userId, contest.groupId, client);
    return { contest, member };
  }

  /** 사진이 없으면 NOT_FOUND, 멤버가 아니면 FORBIDDEN, 숨긴 사진은 관리자가 아니면 NOT_FOUND */
  async accessibleSubmission(
    userId: string,
    submissionId: string,
    { owner = false, client }: IAccessOptions = {},
  ): Promise<ISubmissionAccess> {
    const found = await this.repository.findUniqueSubmission(
      {
        where: { id: submissionId },
        include: { contest: true },
      },
      client,
    );
    if (!found) fail(ERROR_MESSAGE.SUBMISSION_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    const { contest, ...submission } = found;
    const member = owner
      ? await this.requireOwner(userId, contest.groupId, client)
      : await this.requireMember(userId, contest.groupId, client);
    const admin = isOwner(member);
    if (submission.hidden && !admin) fail(ERROR_MESSAGE.SUBMISSION_NOT_FOUND, ERROR_CODE.NOT_FOUND);
    return { submission, contest, member, admin };
  }
}
