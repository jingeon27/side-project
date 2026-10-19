import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import { Database, type TDatabaseClient } from '../database/database.service';
import { recordEvent } from '../analytics/analytics-event.repository';
import type { IAnalyticsEvent } from '../analytics/analytics-event';

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly db: Database) {}

  findManyContest<T extends Prisma.ContestFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.ContestFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.contest.findMany(args);
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

  updateContest<T extends Prisma.ContestUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.ContestUpdateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.contest.update(args);
  }

  recordEvent(client: TDatabaseClient | undefined, event: IAnalyticsEvent) {
    return recordEvent(client ?? this.db, event);
  }
}
