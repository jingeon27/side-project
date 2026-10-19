import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '../../generated/prisma';
type TDatabaseClient = Prisma.TransactionClient;

@Injectable()
export class ReportsRepository {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  updatePost<T extends Prisma.PostUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostUpdateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.post.update(args);
  }

  updateAnswer<T extends Prisma.AnswerUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.AnswerUpdateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.answer.update(args);
  }

  updateComment<T extends Prisma.CommentUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.CommentUpdateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.comment.update(args);
  }

  deleteManyNotification<T extends Prisma.NotificationDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.NotificationDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.notification.deleteMany(args);
  }

  createAuditLog<T extends Prisma.AuditLogCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.AuditLogCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.auditLog.create(args);
  }

  findManyReport<T extends Prisma.ReportFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.ReportFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.report.findMany(args);
  }

  findManyPost<T extends Prisma.PostFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.post.findMany(args);
  }

  findManyAnswer<T extends Prisma.AnswerFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.AnswerFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.answer.findMany(args);
  }

  findManyComment<T extends Prisma.CommentFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.CommentFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.comment.findMany(args);
  }

  findUniqueReport<T extends Prisma.ReportFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.ReportFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.report.findUnique(args);
  }

  updateReport<T extends Prisma.ReportUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.ReportUpdateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.report.update(args);
  }
}
