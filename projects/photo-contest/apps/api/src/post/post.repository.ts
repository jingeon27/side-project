import { postInclude } from './post.query';
import { koreanMonth } from './post-order';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import { Database, type TDatabaseClient } from '../database/database.service';
import { recordEvent } from '../analytics/analytics-event.repository';
import type { IAnalyticsEvent } from '../analytics/analytics-event';

@Injectable()
export class PostRepository {
  constructor(private readonly db: Database) {}

  findManyPostComment<T extends Prisma.PostCommentFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostCommentFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postComment.findMany(args);
  }

  createPostComment<T extends Prisma.PostCommentCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostCommentCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postComment.create(args);
  }

  findUniquePostComment<T extends Prisma.PostCommentFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostCommentFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postComment.findUnique(args);
  }

  deletePostComment<T extends Prisma.PostCommentDeleteArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostCommentDeleteArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postComment.delete(args);
  }

  findManyPost<T extends Prisma.PostFindManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostFindManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.post.findMany(args);
  }

  countPostUpload<T extends Prisma.PostUploadCountArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostUploadCountArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postUpload.count(args);
  }

  createPostUpload<T extends Prisma.PostUploadCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostUploadCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postUpload.create(args);
  }

  findUniquePostUpload<T extends Prisma.PostUploadFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostUploadFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postUpload.findUnique(args);
  }

  updateManyPostUpload<T extends Prisma.PostUploadUpdateManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostUploadUpdateManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postUpload.updateMany(args);
  }

  createPost<T extends Prisma.PostCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostCreateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.post.create(args);
  }

  upsertPostLike<T extends Prisma.PostLikeUpsertArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostLikeUpsertArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postLike.upsert(args);
  }

  deleteManyPostLike<T extends Prisma.PostLikeDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostLikeDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postLike.deleteMany(args);
  }

  findUniqueOrThrowPost<T extends Prisma.PostFindUniqueOrThrowArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostFindUniqueOrThrowArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.post.findUniqueOrThrow(args);
  }

  deletePost<T extends Prisma.PostDeleteArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostDeleteArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.post.delete(args);
  }

  deleteManySubmission<T extends Prisma.SubmissionDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.SubmissionDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.submission.deleteMany(args);
  }

  updatePostUpload<T extends Prisma.PostUploadUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostUploadUpdateArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postUpload.update(args);
  }

  deleteManyPostUpload<T extends Prisma.PostUploadDeleteManyArgs>(
    args: Prisma.SelectSubset<T, Prisma.PostUploadDeleteManyArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.postUpload.deleteMany(args);
  }

  findUniqueContest<T extends Prisma.ContestFindUniqueArgs>(
    args: Prisma.SelectSubset<T, Prisma.ContestFindUniqueArgs>,
    client: TDatabaseClient = this.db,
  ) {
    return client.contest.findUnique(args);
  }

  recordEvent(client: TDatabaseClient | undefined, event: IAnalyticsEvent) {
    return recordEvent(client ?? this.db, event);
  }

  listVisiblePosts({
    groupIds,
    contestId,
    viewerId,
    popular,
    offset,
    limit,
  }: {
    groupIds: string[];
    contestId?: string | null;
    viewerId: string | null;
    popular: boolean;
    offset: number;
    limit: number;
  }) {
    return this.db.post.findMany({
      where: {
        groupId: { in: groupIds },
        ...(contestId ? { contestId } : {}),
        hidden: false,
        OR: [{ legacySubmissionId: null }, { legacySubmission: { hidden: false } }],
        ...(popular ? { createdAt: koreanMonth() } : {}),
      },
      include: postInclude(viewerId),
      skip: offset,
      take: limit,
      orderBy: [
        ...(popular ? [{ likes: { _count: 'desc' as const } }] : []),
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    });
  }
}
