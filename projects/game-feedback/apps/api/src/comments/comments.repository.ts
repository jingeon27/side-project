import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '../generated/prisma';
type TDatabaseClient = Prisma.TransactionClient;

@Injectable()
export class CommentsRepository {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  createComment<T extends Prisma.CommentCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.CommentCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.comment.create(args);
  }

  createNotification<T extends Prisma.NotificationCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.NotificationCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.notification.create(args);
  }

  findFirstComment<T extends Prisma.CommentFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.CommentFindFirstArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.comment.findFirst(args);
  }

  updateComment<T extends Prisma.CommentUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.CommentUpdateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.comment.update(args);
  }
}
