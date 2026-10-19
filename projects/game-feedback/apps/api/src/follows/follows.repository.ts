import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '../generated/prisma';
type TDatabaseClient = Prisma.TransactionClient;

@Injectable()
export class FollowsRepository {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  findFirstUser<T extends Prisma.UserFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFindFirstArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.findFirst(args);
  }

  findUniqueUserFollow<T extends Prisma.UserFollowFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFollowFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.userFollow.findUnique(args);
  }

  findFirstBlock<T extends Prisma.BlockFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.BlockFindFirstArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.block.findFirst(args);
  }

  upsertUserFollow<T extends Prisma.UserFollowUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFollowUpsertArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.userFollow.upsert(args);
  }

  deleteManyUserFollow<T extends Prisma.UserFollowDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFollowDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.userFollow.deleteMany(args);
  }

  lockRelationship(first: string, second: string, client: TDatabaseClient) {
    const key = `user-relationship:${[first, second].sort().join(':')}`;
    return client.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
  }
}
