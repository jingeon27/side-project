import type { ReactNode } from 'react';

/** 작성자와 활동 표시를 양 끝에 두는 카드 바닥 줄 */
export function PostCardFooter({ children }: { children: ReactNode }) {
  return <div className="post-bottom">{children}</div>;
}
