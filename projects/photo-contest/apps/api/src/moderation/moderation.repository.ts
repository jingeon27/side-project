import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import { Database, type TDatabaseClient } from '../database/database.service';

@Injectable()
export class ModerationRepository {
  constructor(private readonly db: Database) {}

  createManyReport<T extends Prisma.ReportCreateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.ReportCreateManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.report.createMany(args);
  }

  updateManySubmission<T extends Prisma.SubmissionUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.SubmissionUpdateManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.submission.updateMany(args);
  }

  findUniqueUpload<T extends Prisma.UploadFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.UploadFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.upload.findUnique(args);
  }

  deleteSubmission<T extends Prisma.SubmissionDeleteArgs>(
    args: Prisma.SelectSubset<T, Prisma.SubmissionDeleteArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.submission.delete(args);
  }

  updateUpload<T extends Prisma.UploadUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.UploadUpdateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.upload.update(args);
  }
}
