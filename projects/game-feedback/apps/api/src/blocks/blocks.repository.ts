import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '../generated/prisma';
type TDatabaseClient = Prisma.TransactionClient;

@Injectable()
export class BlocksRepository {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  findManyBlock<T extends Prisma.BlockFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.BlockFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.block.findMany(args);
  }

  findUniqueUser<T extends Prisma.UserFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.findUnique(args);
  }

  upsertBlock<T extends Prisma.BlockUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.BlockUpsertArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.block.upsert(args);
  }

  deleteManyUserFollow<T extends Prisma.UserFollowDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFollowDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.userFollow.deleteMany(args);
  }

  deleteManyNotification<T extends Prisma.NotificationDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.NotificationDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.notification.deleteMany(args);
  }

  deleteManyBlock<T extends Prisma.BlockDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.BlockDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.block.deleteMany(args);
  }

  lockRelationship(first: string, second: string, client: TDatabaseClient) {
    const key = `user-relationship:${[first, second].sort().join(':')}`;
    return client.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
  }
}
