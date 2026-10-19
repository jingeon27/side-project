import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import { Database, type TDatabaseClient } from '../database/database.service';
import { recordEvent } from '../analytics/analytics-event.repository';
import type { IAnalyticsEvent } from '../analytics/analytics-event';

@Injectable()
export class ContestRepository {
  constructor(private readonly db: Database) {}

  findManyContest<T extends Prisma.ContestFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.ContestFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.contest.findMany(args);
  }

  createContest<T extends Prisma.ContestCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.ContestCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.contest.create(args);
  }

  findManySubmission<T extends Prisma.SubmissionFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.SubmissionFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.submission.findMany(args);
  }

  findManyVote<T extends Prisma.VoteFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.VoteFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.vote.findMany(args);
  }

  visibleSubmissionCounts(ids: readonly string[]) {
    return this.db.submission.groupBy({
      by: ['contestId'],
      where: { contestId: { in: [...ids] }, hidden: false },
      _count: { _all: true },
    });
  }

  recordEvent(client: TDatabaseClient | undefined, event: IAnalyticsEvent) {
    return recordEvent(client ?? this.db, event);
  }
}
