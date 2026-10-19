import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '../../generated/prisma';
type TDatabaseClient = Prisma.TransactionClient;

@Injectable()
export class SupportRepository {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  findManySupportConversation<T extends Prisma.SupportConversationFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.SupportConversationFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.supportConversation.findMany(args);
  }

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

  createAuditLog<T extends Prisma.AuditLogCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.AuditLogCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.auditLog.create(args);
  }
}
