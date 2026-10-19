import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '../generated/prisma';
type TDatabaseClient = Prisma.TransactionClient;
import { seed } from '../seed';

@Injectable()
export class AuthRepository {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  deleteManyAppLoginTicket<T extends Prisma.AppLoginTicketDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.AppLoginTicketDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.appLoginTicket.deleteMany(args);
  }

  createAppLoginTicket<T extends Prisma.AppLoginTicketCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.AppLoginTicketCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.appLoginTicket.create(args);
  }

  findUniqueAppLoginTicket<T extends Prisma.AppLoginTicketFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.AppLoginTicketFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.appLoginTicket.findUnique(args);
  }

  upsertUser<T extends Prisma.UserUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserUpsertArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.upsert(args);
  }

  findManyUser<T extends Prisma.UserFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.findMany(args);
  }

  findFirstUser<T extends Prisma.UserFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFindFirstArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.findFirst(args);
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

  deleteManyOAuthAttempt<T extends Prisma.OAuthAttemptDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.OAuthAttemptDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.oAuthAttempt.deleteMany(args);
  }

  updateUser<T extends Prisma.UserUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserUpdateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.update(args);
  }

  deleteManySession<T extends Prisma.SessionDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.SessionDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.session.deleteMany(args);
  }

  deleteManyPost<T extends Prisma.PostDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.post.deleteMany(args);
  }

  deleteManyAnswer<T extends Prisma.AnswerDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.AnswerDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.answer.deleteMany(args);
  }

  deleteManyComment<T extends Prisma.CommentDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.CommentDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.comment.deleteMany(args);
  }

  deleteManyNotification<T extends Prisma.NotificationDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.NotificationDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.notification.deleteMany(args);
  }

  deleteUser<T extends Prisma.UserDeleteArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserDeleteArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.delete(args);
  }

  findUniqueSession<T extends Prisma.SessionFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.SessionFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.session.findUnique(args);
  }

  createSession<T extends Prisma.SessionCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.SessionCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.session.create(args);
  }

  findUniqueSocialIdentity<T extends Prisma.SocialIdentityFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.SocialIdentityFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.socialIdentity.findUnique(args);
  }

  findUniqueUser<T extends Prisma.UserFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.findUnique(args);
  }

  createSocialIdentity<T extends Prisma.SocialIdentityCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.SocialIdentityCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.socialIdentity.create(args);
  }

  createUser<T extends Prisma.UserCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.user.create(args);
  }

  seedTestAccounts() {
    return seed(this.db, true);
  }

  lockIdentity(provider: string, subject: string, client: TDatabaseClient) {
    const key = `${provider}:${subject}`;
    return client.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
  }

  sessionWithUser(tokenHash: string) {
    return this.db.session.findUnique({ where: { tokenHash }, include: { user: true } });
  }
}
