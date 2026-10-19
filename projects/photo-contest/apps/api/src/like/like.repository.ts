import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import { Database, type TDatabaseClient } from '../database/database.service';
import { recordEvent } from '../analytics/analytics-event.repository';
import type { IAnalyticsEvent } from '../analytics/analytics-event';

@Injectable()
export class LikeRepository {
  constructor(private readonly db: Database) {}

  createManyLike<T extends Prisma.LikeCreateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.LikeCreateManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.like.createMany(args);
  }

  deleteManyLike<T extends Prisma.LikeDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.LikeDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.like.deleteMany(args);
  }

  recordEvent(client: TDatabaseClient | undefined, event: IAnalyticsEvent) {
    return recordEvent(client ?? this.db, event);
  }
}
