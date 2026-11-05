import type { ReactNode } from 'react';

/** 좋아요·투표 버튼 줄 */
export function SubmissionCardActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
