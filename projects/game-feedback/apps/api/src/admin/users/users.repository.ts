import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '../../generated/prisma';
type TDatabaseClient = Prisma.TransactionClient;

@Injectable()
export class UsersRepository {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  findUniqueUser<T extends Prisma.UserFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.findUnique(args);
  }

  updateUser<T extends Prisma.UserUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserUpdateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.update(args);
  }

  createAuditLog<T extends Prisma.AuditLogCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.AuditLogCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.auditLog.create(args);
  }

  lockUser(id: string, client: TDatabaseClient) {
    return client.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
  }
}
