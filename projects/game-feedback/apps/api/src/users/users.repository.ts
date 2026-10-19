import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '../generated/prisma';
type TDatabaseClient = Prisma.TransactionClient;

@Injectable()
export class UsersRepository {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  findManyUser<T extends Prisma.UserFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.findMany(args);
  }

  findManyBlock<T extends Prisma.BlockFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.BlockFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.block.findMany(args);
  }

  findFirstUser<T extends Prisma.UserFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFindFirstArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.findFirst(args);
  }

  countPost<T extends Prisma.PostCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostCountArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.post.count(args);
  }

  countAnswer<T extends Prisma.AnswerCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.AnswerCountArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.answer.count(args);
  }

  demoAuthorIds(client: TDatabaseClient = this.db) {
    return client.user.findMany({ where: { demoKey: { not: null } }, select: { id: true } });
  }
  blocksOf(userId: string, client: TDatabaseClient = this.db) {
    return client.block.findMany({ where: { OR: [{ userId }, { blockedUserId: userId }] } });
  }
}
