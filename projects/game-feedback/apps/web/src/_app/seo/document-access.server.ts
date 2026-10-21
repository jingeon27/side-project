import 'server-only';

import { GameSlugSchema } from '@game-feedback/bridge';
import { ApiError, getPost, getPublicProfile, listCategories } from '@game-feedback/sdk';

import { boardBySlug } from '@/features/board';
import { publicServerOptions } from '@/shared/api/server';

// PPR can send HTML headers before notFound() resolves. Check document access
// before that flush; the actual render still rechecks authorization with REST.
export async function documentUnavailable(path: string, session?: string, games: string[] = []) {
  const board = /^\/(?:ko|en|ja)\/boards\/([^/]+)$/.exec(path);
  if (board) {
    if (!board[1] || !boardBySlug(board[1]) || games.length > 1) return true;
    const game = GameSlugSchema.safeParse(games[0] ?? 'clash-royale');
    if (!game.success) return true;
    try {
      return !(await listCategories(publicServerOptions())).some(
        (category) => category.active && category.slug === game.data,
      );
    } catch {
      return false;
    }
  }
  const match = /^\/(?:ko|en|ja)\/(posts|users)\/([^/]+)$/.exec(path);
  if (!match) return false;
  const [, domain, id] = match;
  if (!id || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) return true;
  try {
    const options = {
      ...publicServerOptions(),
      headers: session ? { Cookie: `gamefeedback_session=${session}` } : undefined,
    };
    await (domain === 'posts' ? getPost(id, options) : getPublicProfile(id, options));
    return false;
  } catch (error) {
    // API failures belong to the service recovery boundary, not a fake 404.
    return error instanceof ApiError && error.status === 404;
  }
}
