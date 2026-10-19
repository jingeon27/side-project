import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '../generated/prisma';
type TDatabaseClient = Prisma.TransactionClient;

@Injectable()
export class GameProfilesRepository {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  findManyGameAccount<T extends Prisma.GameAccountFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.GameAccountFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.gameAccount.findMany(args);
  }

  findUniqueOrThrowUser<T extends Prisma.UserFindUniqueOrThrowArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFindUniqueOrThrowArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.findUniqueOrThrow(args);
  }

  upsertGameAccount<T extends Prisma.GameAccountUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.GameAccountUpsertArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.gameAccount.upsert(args);
  }

  updateUser<T extends Prisma.UserUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserUpdateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.update(args);
  }

  lockUser(id: string, client: TDatabaseClient) {
    return client.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
  }
}
