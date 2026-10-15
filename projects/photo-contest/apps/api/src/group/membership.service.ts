import { Injectable } from '@nestjs/common';

import type { Contest, GroupMember, Submission } from '../../generated/prisma';
import { ERROR_CODE, ERROR_MESSAGE, fail } from '../common/errors';
import { Database } from '../database/database.service';
import type { TDatabaseClient } from '../database/database.service';
import { isOwner } from './group-role';

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

/** 그룹 멤버십 규칙. 목록·상세·사진 파일 모두 이 검사를 거친다(ID를 알아도 접근할 수 없다). */
@Injectable()
export class MembershipService {
  constructor(private readonly db: Database) {}

  /** 여러 그룹을 합친 조회도 멤버십 범위를 먼저 고정한다. */
  async memberGroupIds(userId: string): Promise<string[]> {
    const memberships = await this.db.groupMember.findMany({ where: { userId }, select: { groupId: true } });
    return memberships.map(({ groupId }) => groupId);
  }

  async requireMember(
    userId: string,
    groupId: string,
    client: TDatabaseClient = this.db,
  ): Promise<GroupMember> {
    const member = await client.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (!member) fail(ERROR_MESSAGE.GROUP_FORBIDDEN, ERROR_CODE.FORBIDDEN);
    return member;
  }

  async requireOwner(
    userId: string,
    groupId: string,
    client: TDatabaseClient = this.db,
  ): Promise<GroupMember> {
    const member = await this.requireMember(userId, groupId, client);
    if (!isOwner(member)) fail(ERROR_MESSAGE.GROUP_FORBIDDEN, ERROR_CODE.FORBIDDEN);
    return member;
  }

  /** 대회가 없으면 NOT_FOUND, 그룹 멤버(owner면 관리자)가 아니면 FORBIDDEN */
  async accessibleContest(
    userId: string,
    contestId: string,
    { owner = false, client = this.db }: IAccessOptions = {},
  ): Promise<IContestAccess> {
    const contest = await client.contest.findUnique({ where: { id: contestId } });
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
    { owner = false, client = this.db }: IAccessOptions = {},
  ): Promise<ISubmissionAccess> {
    const found = await client.submission.findUnique({
      where: { id: submissionId },
      include: { contest: true },
    });
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
