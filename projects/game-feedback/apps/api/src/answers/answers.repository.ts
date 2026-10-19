import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '../generated/prisma';
type TDatabaseClient = Prisma.TransactionClient;

@Injectable()
export class AnswersRepository {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  createAnswer<T extends Prisma.AnswerCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.AnswerCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.answer.create(args);
  }

  createNotification<T extends Prisma.NotificationCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.NotificationCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.notification.create(args);
  }

  findFirstAnswer<T extends Prisma.AnswerFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.AnswerFindFirstArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.answer.findFirst(args);
  }

  updateAnswer<T extends Prisma.AnswerUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.AnswerUpdateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.answer.update(args);
  }

  deleteManyNotification<T extends Prisma.NotificationDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.NotificationDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.notification.deleteMany(args);
  }

  updateManyAnswer<T extends Prisma.AnswerUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.AnswerUpdateManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.answer.updateMany(args);
  }

  findUniqueOrThrowAnswer<T extends Prisma.AnswerFindUniqueOrThrowArgs>(
    args: Prisma.SelectSubset<T, Prisma.AnswerFindUniqueOrThrowArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.answer.findUniqueOrThrow(args);
  }
}
