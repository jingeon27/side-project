import type { TypePolicies } from '@apollo/client/cache';
import type { Reference } from '@apollo/client/utilities';

/**
 * 사진 목록은 대회·정렬마다 하나의 목록으로 이어 붙인다(offset·limit은 키에서 뺀다).
 * - 받은 페이지를 offset 자리에 놓고, 페이지 경계가 밀려 같은 사진이 다시 와도 id로 한 번만 남긴다.
 * - 받은 페이지에 없는 기존 사진은 새 사진에 밀려난 것일 수 있어 뒤에 남긴다(polling으로 첫 페이지만 다시 받아도
 *   더 불러온 사진을 잃지 않는다). 그래서 목록에서 사진을 빼려면 updateQuery가 아니라 cache.evict를 쓴다.
 * - 첫 페이지가 limit을 다 채우지 못했으면 그것이 목록 전체다. 다른 사람이 숨기거나 지운 사진도 이때 빠진다.
 */
export const submissionTypePolicies: TypePolicies = {
  Query: {
    fields: {
      submissions: {
        keyArgs: ['contestId', 'sort'],
        merge(existing: readonly Reference[] = [], incoming: readonly Reference[], { args, readField }) {
          const offset = typeof args?.offset === 'number' && args.offset > 0 ? args.offset : 0;
          const limit = typeof args?.limit === 'number' ? args.limit : null;
          const seen = new Set<unknown>();
          const merged: Reference[] = [];
          const append = (item: Reference) => {
            const id = readField('id', item);
            if (seen.has(id)) return;
            seen.add(id);
            merged.push(item);
          };
          if (offset === 0 && limit !== null && incoming.length < limit) {
            incoming.forEach(append);
            return merged;
          }
          existing.slice(0, offset).forEach(append);
          incoming.forEach(append);
          existing.slice(offset).forEach(append);
          return merged;
        },
      },
    },
  },
};
