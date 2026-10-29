import { describe, expect, it } from 'vitest';

import type { SessionRequest } from '../auth/session/session.types';
import type { CacheInvalidationService } from '../cache-invalidation/cache-invalidation.service';
import { ApiError } from '../common/http/api-error';
import type { PrismaClient } from '../generated/prisma';
import type { PostsService } from '../posts/posts.service';
import type { UserVisibilityService } from '../users/visibility/user-visibility.service';
import { CommentsService } from './comments.service';

const transaction = {
  $queryRaw: async () => [],
  post: { findFirst: async () => null },
};
const cache = {
  async change(work: (tx: typeof transaction) => Promise<unknown>, tags: unknown) {
    const result = await work(transaction);
    if (typeof tags === 'function') tags(result);
    return result;
  },
} as unknown as CacheInvalidationService;
const visibility = { excluded: async () => [] } as unknown as UserVisibilityService;
const req = {
  gfSession: { user: { id: 'commenter', nickname: '댓글 작성자' } },
} as unknown as SessionRequest;

describe('CommentsService.createComment', () => {
  it('answers a malformed post id with POST_NOT_FOUND instead of a cache tag validation error', async () => {
    const service = new CommentsService({} as PrismaClient, cache, visibility, {} as PostsService);
    const error = await service
      .createComment(req, 'a.b', { body: '댓글', parentId: undefined })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, response: { errorCode: 'POST_NOT_FOUND' } });
  });
});
