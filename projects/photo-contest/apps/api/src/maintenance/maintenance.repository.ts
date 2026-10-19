import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import { Database, type TDatabaseClient } from '../database/database.service';

@Injectable()
export class MaintenanceRepository {
  constructor(private readonly db: Database) {}

  findManyPostUpload<T extends Prisma.PostUploadFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostUploadFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postUpload.findMany(args);
  }

  deleteManyPostUpload<T extends Prisma.PostUploadDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostUploadDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postUpload.deleteMany(args);
  }

  deleteManyAuthAttempt<T extends Prisma.AuthAttemptDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.AuthAttemptDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.authAttempt.deleteMany(args);
  }

  deleteManySession<T extends Prisma.SessionDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.SessionDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.session.deleteMany(args);
  }

  deleteManyOAuthAttempt<T extends Prisma.OAuthAttemptDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.OAuthAttemptDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.oAuthAttempt.deleteMany(args);
  }

  deleteManyAppLoginTicket<T extends Prisma.AppLoginTicketDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.AppLoginTicketDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.appLoginTicket.deleteMany(args);
  }

  findManyUpload<T extends Prisma.UploadFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.UploadFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.upload.findMany(args);
  }

  deleteManyUpload<T extends Prisma.UploadDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.UploadDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.upload.deleteMany(args);
  }
}
