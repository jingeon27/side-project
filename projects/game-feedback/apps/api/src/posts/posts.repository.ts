import type { ListQueryDto } from '../common/http/list-query.dto';
import { decodeCursor } from '../common/pagination';
import { ACTIVE_CONTENT, ACTIVE_POST } from '../common/content';
import { postInclude } from './post.presenter';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '../generated/prisma';
type TDatabaseClient = Prisma.TransactionClient;

@Injectable()
export class PostsRepository {
  constructor(@Inject(PrismaClient) private readonly db: PrismaClient) {}

  deleteManyPostMedia<T extends Prisma.PostMediaDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostMediaDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postMedia.deleteMany(args);
  }

  countPostMedia<T extends Prisma.PostMediaCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostMediaCountArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postMedia.count(args);
  }

  createPostMedia<T extends Prisma.PostMediaCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostMediaCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postMedia.create(args);
  }

  findFirstPostMedia<T extends Prisma.PostMediaFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostMediaFindFirstArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postMedia.findFirst(args);
  }

  updateManyPostMedia<T extends Prisma.PostMediaUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostMediaUpdateManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postMedia.updateMany(args);
  }

  findFirstPost<T extends Prisma.PostFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostFindFirstArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.post.findFirst(args);
  }

  updatePost<T extends Prisma.PostUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostUpdateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.post.update(args);
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

  findFirstCategory<T extends Prisma.CategoryFindFirstArgs>(
    args: Prisma.SelectSubset<T, Prisma.CategoryFindFirstArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.category.findFirst(args);
  }

  createPost<T extends Prisma.PostCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.post.create(args);
  }

  findManyUserFollow<T extends Prisma.UserFollowFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.UserFollowFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.userFollow.findMany(args);
  }

  createManyNotification<T extends Prisma.NotificationCreateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.NotificationCreateManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.notification.createMany(args);
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

  updateManyNotification<T extends Prisma.NotificationUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.NotificationUpdateManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.notification.updateMany(args);
  }

  lockUser(id: string, client: TDatabaseClient) {
    return client.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
  }

  lockPost(id: string, client: TDatabaseClient) {
    return client.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${id} FOR UPDATE`;
  }

  recordUniqueView(postId: string, visitorHash: string, client: TDatabaseClient) {
    return client.$executeRaw`
      INSERT INTO "PostView" ("postId", "visitorHash", "lastViewedAt")
      VALUES (${postId}, ${visitorHash}, CURRENT_TIMESTAMP)
      ON CONFLICT ("postId", "visitorHash") DO UPDATE SET "lastViewedAt" = CURRENT_TIMESTAMP
      WHERE "PostView"."lastViewedAt" <= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    `;
  }

  lockSubscribedFollowers(userId: string, client: TDatabaseClient) {
    return client.$queryRaw<
      Array<{ followerId: string }>
    >`SELECT "followerId" FROM "UserFollow" WHERE "followingId" = ${userId} AND "notifyNewPosts" = true ORDER BY "followerId" FOR UPDATE`;
  }

  listVisiblePosts(q: ListQueryDto, excluded: string[]) {
    const cursor = decodeCursor(q.cursor);
    const visibleAnswers = { ...ACTIVE_CONTENT, authorId: { notIn: excluded } };
    const answerFilter =
      q.feedbackStatus === 'ANSWERED'
        ? { some: visibleAnswers }
        : q.feedbackStatus === 'WAITING' || q.unanswered === 'true'
          ? { none: visibleAnswers }
          : undefined;
    const where: Prisma.PostWhereInput = {
      ...ACTIVE_POST,
      ...(q.board === 'ALL' || (!q.board && q.authorId) ? {} : { board: q.board ?? 'FEEDBACK' }),
      authorId: { notIn: excluded, ...(q.authorId ? { equals: q.authorId } : {}) },
      ...(q.category ? { category: { slug: q.category } } : {}),
      ...(q.battleMode ? { battle: { path: ['mode'], equals: q.battleMode } } : {}),
      ...(q.coachingRole ? { coaching: { path: ['role'], equals: q.coachingRole } } : {}),
      ...(answerFilter ? { answers: answerFilter } : {}),
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q, mode: 'insensitive' } },
              { body: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    if (cursor)
      where.AND = [
        {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        },
      ];
    return this.db.post.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      include: {
        ...postInclude,
        answers: {
          where: { ...ACTIVE_CONTENT, authorId: { notIn: excluded } },
          select: { id: true, helpful: true },
        },
      },
    });
  }
}
