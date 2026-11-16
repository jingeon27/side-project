import { SubmissionSort } from '@/shared/api/generated';
import type { TPhotoSortValue } from '@/shared/model/analytics';

/** 피드 한 번에 받는 사진 수(API limit 1~48) */
export const FEED_PAGE_SIZE = 24;

/** 주소(`?sort=`)에 쓰는 정렬 값 → API 정렬 */
export const PHOTO_SORT = {
  latest: SubmissionSort.Newest,
  popular: SubmissionSort.MostLiked,
} as const satisfies Record<TPhotoSortValue, SubmissionSort>;
export type TPhotoSort = keyof typeof PHOTO_SORT;
