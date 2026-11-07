import { createContext, use } from 'react';

import type { SubmissionCardFragment } from '@/shared/api/generated';

export type TCardSubmission = Pick<SubmissionCardFragment, 'caption' | 'imageUrl' | 'hidden' | 'author'>;

interface ISubmissionCardContext {
  submission: TCardSubmission;
  /** 카드 이름으로 쓰는 캡션 제목의 id */
  captionId: string;
}

export const SubmissionCardContext = createContext<ISubmissionCardContext | null>(null);

/** 카드 부품이 감싼 SubmissionCard의 사진과 캡션 id를 읽는다. */
export function useSubmissionCard() {
  const context = use(SubmissionCardContext);
  if (!context) throw new Error('SubmissionCard is required.');
  return context;
}
