import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '../generated/prisma';
type TDatabaseClient = Prisma.TransactionClient;

@Injectable()
export class ChatRepository {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  deleteManyChatAttachment<T extends Prisma.ChatAttachmentDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.ChatAttachmentDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.chatAttachment.deleteMany(args);
  }

  countChatAttachment<T extends Prisma.ChatAttachmentCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.ChatAttachmentCountArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.chatAttachment.count(args);
  }

  createChatAttachment<T extends Prisma.ChatAttachmentCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.ChatAttachmentCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.chatAttachment.create(args);
  }

  findFirstChatConversation<T extends Prisma.ChatConversationFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.ChatConversationFindFirstArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.chatConversation.findFirst(args);
  }

  findFirstChatAttachment<T extends Prisma.ChatAttachmentFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.ChatAttachmentFindFirstArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.chatAttachment.findFirst(args);
  }

  findManyChatConversation<T extends Prisma.ChatConversationFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.ChatConversationFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.chatConversation.findMany(args);
  }

  findUniqueSession<T extends Prisma.SessionFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.SessionFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.session.findUnique(args);
  }

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

  findFirstBlock<T extends Prisma.BlockFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.BlockFindFirstArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.block.findFirst(args);
  }

  findFirstChatMessage<T extends Prisma.ChatMessageFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.ChatMessageFindFirstArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.chatMessage.findFirst(args);
  }

  countChatMessage<T extends Prisma.ChatMessageCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.ChatMessageCountArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.chatMessage.count(args);
  }

  findUniqueUser<T extends Prisma.UserFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.findUnique(args);
  }

  upsertChatConversation<T extends Prisma.ChatConversationUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.ChatConversationUpsertArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.chatConversation.upsert(args);
  }

  findUniqueOrThrowChatConversation<T extends Prisma.ChatConversationFindUniqueOrThrowArgs>(
    args: Prisma.SelectSubset<T, Prisma.ChatConversationFindUniqueOrThrowArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.chatConversation.findUniqueOrThrow(args);
  }

  findManyChatMessage<T extends Prisma.ChatMessageFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.ChatMessageFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.chatMessage.findMany(args);
  }

  findUniqueChatMessage<T extends Prisma.ChatMessageFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.ChatMessageFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.chatMessage.findUnique(args);
  }

  createChatMessage<T extends Prisma.ChatMessageCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.ChatMessageCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.chatMessage.create(args);
  }

  updateChatConversation<T extends Prisma.ChatConversationUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.ChatConversationUpdateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.chatConversation.update(args);
  }

  updateManySupportConversation<T extends Prisma.SupportConversationUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.SupportConversationUpdateManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.supportConversation.updateMany(args);
  }

  lockConversation(id: string, client: TDatabaseClient) {
    return client.$queryRaw`SELECT "id" FROM "ChatConversation" WHERE "id" = ${id} FOR UPDATE`;
  }

  lockUser(id: string, client: TDatabaseClient) {
    return client.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
  }
}
