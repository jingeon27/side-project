import 'server-only';

import { GameSlugSchema } from '@game-feedback/bridge';
import { ApiError, getPublicProfile, listCategories } from '@game-feedback/sdk';

import { boardBySlug } from '@/features/board';
// index.server는 'use cache' 조회를 함께 공개한다. Proxy 번들에는 접근 판정 모듈만 가져온다.
import { isPostDocumentUnavailable } from '@/features/post/api/post-access.server';
import { visitorLookupOptions } from '@/shared/api/server';

// PPR can send HTML headers before notFound() resolves. Check document access
// before that flush; the actual render still rechecks authorization with REST.
// These lookups run per request, so they spend the visitor's own API budget (`visitor` from the proxy).
export async function documentUnavailable(
  path: string,
  session?: string,
  games: string[] = [],
  visitor: string | null = null,
) {
  const board = /^\/(?:ko|en|ja)\/boards\/([^/]+)$/.exec(path);
  if (board) {
    if (!board[1] || !boardBySlug(board[1]) || games.length > 1) return true;
    const game = GameSlugSchema.safeParse(games[0] ?? 'clash-royale');
    if (!game.success) return true;
    try {
      return !(await listCategories(visitorLookupOptions(visitor))).some(
        (category) => category.active && category.slug === game.data,
      );
    } catch {
      return false;
    }
  }
  const post = /^\/(?:ko|en|ja)\/posts\/([^/]+)$/.exec(path);
  if (post) return isPostDocumentUnavailable(post[1] ?? '', session, visitor);
  const profile = /^\/(?:ko|en|ja)\/users\/([^/]+)$/.exec(path);
  if (!profile) return false;
  const id = profile[1];
  if (!id || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) return true;
  try {
    const options = visitorLookupOptions(visitor);
    await getPublicProfile(id, {
      ...options,
      headers: { ...options.headers, ...(session ? { Cookie: `gamefeedback_session=${session}` } : {}) },
    });
    return false;
  } catch (error) {
    // API failures belong to the service recovery boundary, not a fake 404.
    return error instanceof ApiError && error.status === 404;
  }
}
