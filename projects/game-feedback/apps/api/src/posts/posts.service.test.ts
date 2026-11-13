import dayjs from 'dayjs';
import { describe, expect, it, vi } from 'vitest';

import { PostInputSchema } from '@game-feedback/contracts';

import type { SessionRequest } from '../auth/session/session.types';
import type { CacheInvalidationService } from '../cache-invalidation/cache-invalidation.service';
import { ApiError } from '../common/http/api-error';
import type { PrismaClient } from '../generated/prisma';
import type { UserVisibilityService } from '../users/visibility/user-visibility.service';
import type { PostMediaService } from './media/post-media.service';
import { PostsService } from './posts.service';

const input = PostInputSchema.parse({
  categoryId: 'clash-royale',
  board: 'FREE',
  title: '응답이 끊긴 글쓰기',
  body: '같은 초안을 다시 보내요',
  clientRequestId: '00000000-0000-4000-8000-000000000001',
});
const category = { id: 'clash-royale', slug: 'clash-royale', name: '클래시로얄', active: true };
const saved = {
  id: 'post-1',
  authorId: 'writer',
  categoryId: 'clash-royale',
  category,
  author: {
    id: 'writer',
    nickname: '작성자',
    isVerified: false,
    supercellTag: null,
    demoKey: null,
    avatar: null,
  },
  clientRequestId: input.clientRequestId,
  title: input.title,
  body: input.body,
  board: 'FREE',
  document: null,
  coaching: null,
  friendSale: null,
  battle: null,
  gameProfile: null,
  hidden: false,
  viewCount: 0,
  deletedAt: null,
  createdAt: dayjs('2026-11-11T00:00:00.000Z').toDate(),
  updatedAt: dayjs('2026-11-11T00:00:00.000Z').toDate(),
};

/** 사용자 잠금 아래에서 처음 저장한 글을 찾는 재시도만 본다. 다른 쓰기는 일어나면 실패한다. */
function service(previous: typeof saved) {
  const tx = {
    $queryRaw: vi.fn(async () => []),
    user: { findUnique: vi.fn(async () => ({ id: 'writer', withdrawnAt: null, bannedAt: null })) },
    post: { findUnique: vi.fn(async () => previous), create: vi.fn() },
  };
  const tags: unknown[] = [];
  const cache = {
    async change(work: (client: typeof tx) => Promise<unknown>, tagsOf: (result: unknown) => unknown) {
      const result = await work(tx);
      tags.push(tagsOf(result));
      return result;
    },
  } as unknown as CacheInvalidationService;
  const db = { category: { findFirst: vi.fn(async () => category) } } as unknown as PrismaClient;
  const media = { sync: vi.fn() } as unknown as PostMediaService;
  return {
    tx,
    tags,
    media,
    posts: new PostsService(db, cache, {} as UserVisibilityService, media),
  };
}
const req = { gfSession: { user: { id: 'writer', nickname: '작성자' } } } as unknown as SessionRequest;

describe('PostsService.createPost 요청 키', () => {
  it('응답만 끊긴 같은 초안의 재시도는 새 글·미디어 연결·캐시 무효화 없이 처음 글을 돌려준다', async () => {
    const { posts, tx, tags, media } = service(saved);
    const result = await posts.createPost(req, input);
    expect(result).toMatchObject({ id: 'post-1', title: input.title });
    expect(tx.post.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { authorId_clientRequestId: { authorId: 'writer', clientRequestId: input.clientRequestId } },
      }),
    );
    expect(tx.post.create).not.toHaveBeenCalled();
    expect(media.sync).not.toHaveBeenCalled();
    expect(tags).toEqual([[]]);
  });

  it('같은 요청 키로 다른 내용을 보내면 기존 글을 덮지 않고 거부한다', async () => {
    const { posts, tx } = service({ ...saved, title: '먼저 올린 다른 제목' });
    const error = await posts.createPost(req, input).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, response: { errorCode: 'POST_CONFLICT' } });
    expect(tx.post.create).not.toHaveBeenCalled();
  });
});
