import type { TypePolicies } from '@apollo/client/cache';

/** 초대 미리보기는 id가 없어 정규화되지 않는다. 다시 받으면 서버 응답으로 통째로 바꾼다. */
export const inviteTypePolicies: TypePolicies = {
  Query: {
    fields: {
      invitePreview: { merge: false },
    },
  },
};
