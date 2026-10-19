import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '../generated/prisma';
type TDatabaseClient = Prisma.TransactionClient;

@Injectable()
export class NotificationsRepository {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  findManyNotification<T extends Prisma.NotificationFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.NotificationFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.notification.findMany(args);
  }

  countNotification<T extends Prisma.NotificationCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.NotificationCountArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.notification.count(args);
  }

  updateManyNotification<T extends Prisma.NotificationUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.NotificationUpdateManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.notification.updateMany(args);
  }

  findFirstNotification<T extends Prisma.NotificationFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.NotificationFindFirstArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.notification.findFirst(args);
  }
}
