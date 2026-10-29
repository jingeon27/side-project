import type { ReactNode } from 'react';

/** 게시물 카드를 한 열로 쌓는 피드 틀. 카드 종류와 카드 아래 행동은 쓰는 쪽이 넣는다. */
export function PostCardList({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-6" data-photo-feed>
      {children}
    </div>
  );
}
