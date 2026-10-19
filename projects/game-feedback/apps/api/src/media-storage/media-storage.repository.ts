import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '../generated/prisma';
type TDatabaseClient = Prisma.TransactionClient;

@Injectable()
export class MediaStorageRepository {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  createMediaObject<T extends Prisma.MediaObjectCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.MediaObjectCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.mediaObject.create(args);
  }

  deleteManyPostMedia<T extends Prisma.PostMediaDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostMediaDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postMedia.deleteMany(args);
  }

  deleteManyChatAttachment<T extends Prisma.ChatAttachmentDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.ChatAttachmentDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.chatAttachment.deleteMany(args);
  }

  updateManyMediaObject<T extends Prisma.MediaObjectUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.MediaObjectUpdateManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.mediaObject.updateMany(args);
  }

  findManyMediaObject<T extends Prisma.MediaObjectFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.MediaObjectFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.mediaObject.findMany(args);
  }

  deleteMediaObject<T extends Prisma.MediaObjectDeleteArgs>(
    args: Prisma.SelectSubset<T, Prisma.MediaObjectDeleteArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.mediaObject.delete(args);
  }
}
