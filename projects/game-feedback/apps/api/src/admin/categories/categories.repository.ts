import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '../../generated/prisma';
type TDatabaseClient = Prisma.TransactionClient;

@Injectable()
export class CategoriesRepository {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  createCategory<T extends Prisma.CategoryCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.CategoryCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.category.create(args);
  }

  createAuditLog<T extends Prisma.AuditLogCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.AuditLogCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.auditLog.create(args);
  }
}
