import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import { Database, type TDatabaseClient } from '../database/database.service';

@Injectable()
export class FeedRepository {
  constructor(private readonly db: Database) {}

  findManySubmission<T extends Prisma.SubmissionFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.SubmissionFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.submission.findMany(args);
  }
}
