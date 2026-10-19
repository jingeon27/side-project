import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import { Database, type TDatabaseClient } from '../database/database.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly db: Database) {}

  upsertUser<T extends Prisma.UserUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserUpsertArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.upsert(args);
  }

  createOAuthAttempt<T extends Prisma.OAuthAttemptCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.OAuthAttemptCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.oAuthAttempt.create(args);
  }

  findUniqueOAuthAttempt<T extends Prisma.OAuthAttemptFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.OAuthAttemptFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.oAuthAttempt.findUnique(args);
  }

  findUniqueAppLoginTicket<T extends Prisma.AppLoginTicketFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.AppLoginTicketFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.appLoginTicket.findUnique(args);
  }

  deleteManyAppLoginTicket<T extends Prisma.AppLoginTicketDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.AppLoginTicketDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.appLoginTicket.deleteMany(args);
  }

  deleteManyOAuthAttempt<T extends Prisma.OAuthAttemptDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.OAuthAttemptDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.oAuthAttempt.deleteMany(args);
  }

  createAppLoginTicket<T extends Prisma.AppLoginTicketCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.AppLoginTicketCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.appLoginTicket.create(args);
  }

  createUser<T extends Prisma.UserCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.create(args);
  }

  findUniquePasswordCredential<T extends Prisma.PasswordCredentialFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.PasswordCredentialFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.passwordCredential.findUnique(args);
  }

  upsertAuthAttempt<T extends Prisma.AuthAttemptUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.AuthAttemptUpsertArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.authAttempt.upsert(args);
  }

  createSession<T extends Prisma.SessionCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.SessionCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.session.create(args);
  }

  deleteManySession<T extends Prisma.SessionDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.SessionDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.session.deleteMany(args);
  }

  findUniqueSession<T extends Prisma.SessionFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.SessionFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.session.findUnique(args);
  }

  sessionWithViewer(tokenHash: string) {
    return this.db.session.findUnique({
      where: { tokenHash },
      select: { expiresAt: true, user: { select: { id: true, nickname: true, avatar: true } } },
    });
  }
}
