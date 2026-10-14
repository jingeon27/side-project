import type { Prisma } from '../../generated/prisma';

export const SUBMISSION_SORT = {
  NEWEST: 'NEWEST',
  OLDEST: 'OLDEST',
  MOST_LIKED: 'MOST_LIKED',
} as const;

export type TSubmissionSort = (typeof SUBMISSION_SORT)[keyof typeof SUBMISSION_SORT];

// 같은 시각에 올라온 사진도 페이지마다 순서가 흔들리지 않도록 id로 마지막 순서를 고정한다.
const ORDER_BY = {
  NEWEST: [{ createdAt: 'desc' }, { id: 'desc' }],
  OLDEST: [{ createdAt: 'asc' }, { id: 'asc' }],
  MOST_LIKED: [{ likes: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }],
} as const satisfies Record<TSubmissionSort, readonly Prisma.SubmissionOrderByWithRelationInput[]>;

export function isSubmissionSort(value: unknown): value is TSubmissionSort {
  return typeof value === 'string' && Object.hasOwn(SUBMISSION_SORT, value);
}

/** 값이 없으면(null 포함) 최신순 */
export function toSubmissionSort(value: unknown): TSubmissionSort {
  return isSubmissionSort(value) ? value : SUBMISSION_SORT.NEWEST;
}

export function submissionOrderBy(sort: TSubmissionSort): Prisma.SubmissionOrderByWithRelationInput[] {
  return [...ORDER_BY[sort]];
}
