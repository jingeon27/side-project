import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import { Database, type TDatabaseClient } from '../database/database.service';
import { recordEvent } from '../analytics/analytics-event.repository';
import type { IAnalyticsEvent } from '../analytics/analytics-event';

@Injectable()
export class SubmissionRepository {
  constructor(private readonly db: Database) {}

  findManySubmission<T extends Prisma.SubmissionFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.SubmissionFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.submission.findMany(args);
  }

  findUniqueSubmission<T extends Prisma.SubmissionFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.SubmissionFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.submission.findUnique(args);
  }

  countUpload<T extends Prisma.UploadCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.UploadCountArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.upload.count(args);
  }

  createUpload<T extends Prisma.UploadCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.UploadCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.upload.create(args);
  }

  findUniqueUpload<T extends Prisma.UploadFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.UploadFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.upload.findUnique(args);
  }

  updateManyUpload<T extends Prisma.UploadUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.UploadUpdateManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.upload.updateMany(args);
  }

  createSubmission<T extends Prisma.SubmissionCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.SubmissionCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.submission.create(args);
  }

  findFirstSubmission<T extends Prisma.SubmissionFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.SubmissionFindFirstArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.submission.findFirst(args);
  }

  recordEvent(client: TDatabaseClient | undefined, event: IAnalyticsEvent) {
    return recordEvent(client ?? this.db, event);
  }
}
