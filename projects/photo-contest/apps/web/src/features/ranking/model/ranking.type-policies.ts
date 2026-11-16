import type { TypePolicies } from '@apollo/client/cache';

/** 결과(Result)는 id가 없어 정규화되지 않는다. 다시 받으면 서버 순위로 통째로 바꾼다. */
export const rankingTypePolicies = {
  Query: {
    fields: {
      contestResults: { merge: false },
    },
  },
} satisfies TypePolicies;
