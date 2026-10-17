import type { TBoardKind } from '@game-feedback/contracts';

export const communityBoards = [
  {
    kind: 'ACCOUNT_TRADE',
    slug: 'account-trade',
    name: '계정 거래',
    description: '계정 거래 게시글을 살펴보고 작성자와 채팅으로 이야기해보세요.',
  },
  {
    kind: 'FRIENDLY',
    slug: 'friendly',
    name: '친선전 모집',
    description: '함께 연습할 상대를 찾고 친선전을 모집해보세요.',
  },
  {
    kind: 'FRIEND',
    slug: 'friends',
    name: '친구 추가',
    description: '함께 플레이할 친구를 찾고 플레이어 태그를 나눠보세요.',
  },
  {
    kind: 'SALE',
    slug: 'marketplace',
    name: '일반 판매',
    description: '판매 게시글을 등록하고 관심 있는 플레이어와 이야기해보세요.',
  },
] as const;
export function boardBySlug(slug: string) {
  return communityBoards.find((board) => board.slug === slug);
}
export function boardByKind(kind?: TBoardKind) {
  return communityBoards.find((board) => board.kind === kind);
}
