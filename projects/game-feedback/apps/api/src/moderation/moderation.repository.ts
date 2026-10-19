import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '../generated/prisma';
type TDatabaseClient = Prisma.TransactionClient;

@Injectable()
export class ModerationRepository {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  findUniqueUser<T extends Prisma.UserFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.findUnique(args);
  }

  upsertReport<T extends Prisma.ReportUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.ReportUpsertArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.report.upsert(args);
  }
}
