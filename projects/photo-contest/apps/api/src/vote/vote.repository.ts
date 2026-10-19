import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import { Database, type TDatabaseClient } from '../database/database.service';
import { recordEvent } from '../analytics/analytics-event.repository';
import type { IAnalyticsEvent } from '../analytics/analytics-event';

@Injectable()
export class VoteRepository {
  constructor(private readonly db: Database) {}

  findUniqueSubmission<T extends Prisma.SubmissionFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.SubmissionFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.submission.findUnique(args);
  }

  createVote<T extends Prisma.VoteCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.VoteCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.vote.create(args);
  }

  recordEvent(client: TDatabaseClient | undefined, event: IAnalyticsEvent) {
    return recordEvent(client ?? this.db, event);
  }
}
