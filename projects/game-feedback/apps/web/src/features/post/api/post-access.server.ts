import dayjs from 'dayjs';

import 'server-only';

import { ApiError, getPost } from '@game-feedback/sdk';

import { publicServerOptions, visitorLookupOptions } from '@/shared/api/server';

import { requestExcludedAuthors } from './excluded-authors.server';
import { POST_ID_PATTERN } from './post-cache';

type TPublicPostAccess = { authorId: string } | null;
interface IPublicPostAccessCacheOptions {
  ttlMs: number;
  maxEntries: number;
  now: () => number;
}
interface IPublicPostAccessEntry {
  expiresAt: number;
  value: Promise<TPublicPostAccess>;
}

/**
 * 문서 접근 판정용 공개 조회 결과(작성자 id 또는 없는 글)를 프로세스 안에서 짧게 기억한다.
 * Proxy는 `'use cache'`를 실행하지 못해(Next 16.4 proxy adapter: "Proxy does not support `use cache`")
 * 렌더의 태그 캐시를 함께 쓸 수 없다. 만료 전 삭제·숨김은 렌더가 태그 캐시로 다시 확인해 본문을 막는다.
 */
export class PublicPostAccessCache {
  private readonly entries = new Map<string, IPublicPostAccessEntry>();

  constructor(
    private readonly lookup: (id: string, visitor: string | null) => Promise<TPublicPostAccess>,
    private readonly options: IPublicPostAccessCacheOptions = {
      ttlMs: 30_000,
      maxEntries: 500,
      now: () => dayjs().valueOf(),
    },
  ) {}

  /** 기억하지 않은 글만 조회하며, 그 조회는 처음 요청한 방문자의 API 예산을 쓴다. */
  get(id: string, visitor: string | null = null) {
    const now = this.options.now();
    const cached = this.entries.get(id);
    if (cached && cached.expiresAt > now) return cached.value;
    this.entries.delete(id);
    const value = this.lookup(id, visitor);
    this.entries.set(id, { expiresAt: now + this.options.ttlMs, value });
    // API 장애는 기억하지 않는다. 다음 요청이 다시 조회한다.
    value.catch(() => {
      if (this.entries.get(id)?.value === value) this.entries.delete(id);
    });
    for (const key of this.entries.keys()) {
      if (this.entries.size <= this.options.maxEntries) break;
      this.entries.delete(key);
    }
    return value;
  }
}

async function lookupPublicPost(id: string, visitor: string | null): Promise<TPublicPostAccess> {
  try {
    const { post } = await getPost(id, visitorLookupOptions(visitor));
    return { authorId: post.author.id };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
const publicPosts = new PublicPostAccessCache(lookupPublicPost);

/**
 * 첫 문서가 404여야 하는 게시글인지 판정한다. 렌더의 `getServerPost`와 같은 규칙(공개 상세 + 차단 관계)이며
 * 비로그인 요청은 공개 조회만, 로그인 요청은 차단 목록만 추가로 받는다. API 장애는 404로 바꾸지 않는다.
 */
export async function isPostDocumentUnavailable(id: string, session?: string, visitor: string | null = null) {
  if (!POST_ID_PATTERN.test(id)) return true;
  try {
    const post = await publicPosts.get(id, visitor);
    if (!post) return true;
    if (!session) return false;
    const excluded = await requestExcludedAuthors({
      ...publicServerOptions(),
      headers: { Cookie: `gamefeedback_session=${session}` },
    });
    return excluded.has(post.authorId);
  } catch {
    return false;
  }
}
