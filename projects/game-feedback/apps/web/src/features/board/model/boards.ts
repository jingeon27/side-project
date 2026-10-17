import type { TBoardKind } from '@game-feedback/contracts';
import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';

export const communityBoards = [
  {
    kind: 'FRIEND_SALE',
    slug: 'friend-sale',
    name: '친추판매',
    description: '친구 추가 판매 글을 올리고 관심 있는 플레이어와 이야기해보세요.',
  },
  {
    kind: 'FRIENDLY',
    slug: 'friendly',
    name: '친선전 모집',
    description: '함께 연습할 상대를 찾고 친선전을 모집해보세요.',
  },
] as const;
export const clashRoyaleBoards = [{ kind: 'FEEDBACK', name: '피드백' }, ...communityBoards] as const;
export function boardBySlug(slug: string) {
  return communityBoards.find((board) => board.slug === slug);
}
export function boardByKind(kind?: TBoardKind) {
  return communityBoards.find((board) => board.kind === kind);
}
export function gameBoardPath(locale: string, kind: TBoardKind) {
  const board = boardByKind(kind);
  return board ? appRoutes.boards(locale, board.slug) : appRoutes.feed(locale);
}
export function activeGameBoard(path: string): TBoardKind | undefined {
  const route = resolveAppRoute(path);
  if (!route || !['feed', 'boards', 'post'].includes(route.screen)) return;
  const parent = route.screen === 'post' ? route.parent : route.path.split('?')[0];
  return (
    communityBoards.find((board) => parent === appRoutes.boards(route.locale, board.slug))?.kind ?? 'FEEDBACK'
  );
}
