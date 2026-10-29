import { appRoutes, resolveAppRoute } from '@game-feedback/bridge';
import type { TBoardKind } from '@game-feedback/contracts';

interface IBoardConfig {
  kind: TBoardKind;
  slug: string;
  name: string;
  description: string;
}

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
    name: '전투 모집',
    description: '1:1 대전 상대나 함께 전투할 팀원을 모집해보세요.',
  },
  {
    kind: 'COACHING',
    slug: 'coaching',
    name: '게임코치',
    description: '코치의 강의와 레슨을 살펴보고 채팅으로 상담해보세요.',
  },
  {
    kind: 'FREE',
    slug: 'free',
    name: '자유게시판',
    description: '게임 이야기와 일상을 자유롭게 나눠보세요.',
  },
] as const satisfies readonly IBoardConfig[];
export const gameBoards = [
  {
    kind: 'FEEDBACK',
    slug: 'feedback',
    name: '피드백',
    description: '플레이 고민을 나누고 다른 플레이어의 피드백을 받아보세요.',
  },
  ...communityBoards,
] as const satisfies readonly IBoardConfig[];
export function boardBySlug(slug: string) {
  return gameBoards.find((board) => board.slug === slug);
}
export function boardByKind(kind?: TBoardKind) {
  return gameBoards.find((board) => board.kind === (kind ?? 'FEEDBACK'));
}
export function gameBoardPath(locale: string, kind: TBoardKind, game?: string) {
  const board = boardByKind(kind);
  return appRoutes.boards(locale, board?.slug ?? 'feedback', undefined, game);
}
export function activeGameBoard(path: string): TBoardKind | undefined {
  const route = resolveAppRoute(path);
  if (!route || !['boards', 'post'].includes(route.screen)) return;
  const parent = (route.screen === 'post' ? route.parent : route.path)?.split('?')[0];
  return gameBoards.find((board) => parent === appRoutes.boards(route.locale, board.slug))?.kind;
}
