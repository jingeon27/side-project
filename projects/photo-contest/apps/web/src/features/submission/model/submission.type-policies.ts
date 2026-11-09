import type { TypePolicies } from '@apollo/client/cache';

import { offsetPagePagination } from '@/shared/api/offset-page-pagination';

/** 사진 목록은 대회·정렬마다 하나다. offset으로 받은 페이지를 그 자리에 이어 붙인다(Apollo 공식 offset 예제). */
export const submissionTypePolicies = {
  Query: {
    fields: {
      submissionsPage: offsetPagePagination(['contestId', 'sort']),
    },
  },
} satisfies TypePolicies;
