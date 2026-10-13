import type { TypePolicies } from '@apollo/client/cache';

/** id가 없는 객체 목록(멤버, 그룹 순위)은 서버 응답으로 통째로 바꾼다. */
export const groupTypePolicies: TypePolicies = {
  Group: {
    fields: {
      members: { merge: false },
      leaderboard: { merge: false },
    },
  },
};
