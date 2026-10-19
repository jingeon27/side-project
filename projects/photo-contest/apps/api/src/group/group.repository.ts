import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import { Database, type TDatabaseClient } from '../database/database.service';
import { recordEvent } from '../analytics/analytics-event.repository';
import type { IAnalyticsEvent } from '../analytics/analytics-event';

@Injectable()
export class GroupRepository {
  constructor(private readonly db: Database) {}

  findManyGroupJoinRequest<T extends Prisma.GroupJoinRequestFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.GroupJoinRequestFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.groupJoinRequest.findMany(args);
  }

  findUniqueGroupJoinRequest<T extends Prisma.GroupJoinRequestFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.GroupJoinRequestFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.groupJoinRequest.findUnique(args);
  }

  createManyGroupMember<T extends Prisma.GroupMemberCreateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.GroupMemberCreateManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.groupMember.createMany(args);
  }

  deleteGroupJoinRequest<T extends Prisma.GroupJoinRequestDeleteArgs>(
    args: Prisma.SelectSubset<T, Prisma.GroupJoinRequestDeleteArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.groupJoinRequest.delete(args);
  }

  findManyGroupMember<T extends Prisma.GroupMemberFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.GroupMemberFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.groupMember.findMany(args);
  }

  findUniqueGroup<T extends Prisma.GroupFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.GroupFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.group.findUnique(args);
  }

  findManyGroup<T extends Prisma.GroupFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.GroupFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.group.findMany(args);
  }

  countGroup<T extends Prisma.GroupCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.GroupCountArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.group.count(args);
  }

  createGroup<T extends Prisma.GroupCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.GroupCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.group.create(args);
  }

  findUniqueGroupMember<T extends Prisma.GroupMemberFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.GroupMemberFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.groupMember.findUnique(args);
  }

  createManyGroupJoinRequest<T extends Prisma.GroupJoinRequestCreateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.GroupJoinRequestCreateManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.groupJoinRequest.createMany(args);
  }

  deleteManyGroupJoinRequest<T extends Prisma.GroupJoinRequestDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.GroupJoinRequestDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.groupJoinRequest.deleteMany(args);
  }

  updateGroup<T extends Prisma.GroupUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.GroupUpdateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.group.update(args);
  }

  countGroupMember<T extends Prisma.GroupMemberCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.GroupMemberCountArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.groupMember.count(args);
  }

  findFirstGroupMember<T extends Prisma.GroupMemberFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.GroupMemberFindFirstArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.groupMember.findFirst(args);
  }

  findManySubmission<T extends Prisma.SubmissionFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.SubmissionFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.submission.findMany(args);
  }

  findUniquePost<T extends Prisma.PostFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.post.findUnique(args);
  }

  findUniqueContest<T extends Prisma.ContestFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.ContestFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.contest.findUnique(args);
  }

  findUniqueSubmission<T extends Prisma.SubmissionFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.SubmissionFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.submission.findUnique(args);
  }

  recordEvent(client: TDatabaseClient | undefined, event: IAnalyticsEvent) {
    return recordEvent(client ?? this.db, event);
  }
}
