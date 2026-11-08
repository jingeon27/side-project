import type { TypePolicies } from '@apollo/client/cache';

import { offsetPagePagination } from '@/shared/api/offset-page-pagination';

/** 숨긴 사진 목록은 삭제되면 줄어들므로 서버 응답으로 통째로 바꾼다. */
export const contestTypePolicies = {
  Query: { fields: { groupContestsPage: offsetPagePagination(['groupId', 'filter']) } },
  GroupContest: { fields: { winners: { merge: false } } },
  Contest: {
    fields: {
      hiddenSubmissions: { merge: false },
    },
  },
} satisfies TypePolicies;
