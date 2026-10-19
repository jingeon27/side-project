import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '../generated/prisma';
type TDatabaseClient = Prisma.TransactionClient;

@Injectable()
export class SupportRepository {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  findFirstSupportConversation<T extends Prisma.SupportConversationFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.SupportConversationFindFirstArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.supportConversation.findFirst(args);
  }

  updateSupportConversation<T extends Prisma.SupportConversationUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.SupportConversationUpdateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.supportConversation.update(args);
  }

  findFirstUser<T extends Prisma.UserFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFindFirstArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.findFirst(args);
  }

  upsertChatConversation<T extends Prisma.ChatConversationUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.ChatConversationUpsertArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.chatConversation.upsert(args);
  }

  createSupportConversation<T extends Prisma.SupportConversationCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.SupportConversationCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.supportConversation.create(args);
  }

  lockUser(id: string, client: TDatabaseClient) {
    return client.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
  }
}
