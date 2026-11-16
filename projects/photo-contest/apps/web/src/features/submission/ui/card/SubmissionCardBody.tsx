import type { ReactNode } from 'react';

/** 사진 아래 여백 안의 구역. 순위·캡션·숫자·행동·관리 줄을 넣는 순서대로 쌓는다. */
export function SubmissionCardBody({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 p-4">{children}</div>;
}
