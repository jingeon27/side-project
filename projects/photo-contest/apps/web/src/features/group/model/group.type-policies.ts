import type { TypePolicies } from '@apollo/client/cache';

import { offsetPagePagination } from '@/shared/api/offset-page-pagination';

/** id가 없는 객체 목록(멤버, 그룹 순위)은 서버 응답으로 통째로 바꾼다. */
export const groupTypePolicies = {
  Query: {
    fields: {
      discoverGroupsPage: offsetPagePagination(['search', 'visibility']),
      groupJoinRequestsPage: offsetPagePagination(['groupId']),
    },
  },
  Group: {
    fields: {
      categories: { merge: false },
      members: { merge: false },
      leaderboard: { merge: false },
    },
  },
} satisfies TypePolicies;
