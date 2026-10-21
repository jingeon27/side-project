import type { ApolloCache } from '@apollo/client';

import { GroupDocument, type ContestListItemFragment } from '@/shared/api/generated';

/** 새 대회를 그룹 화면 대회 목록(최신순) 맨 앞에 넣는다. 홈 그룹 카드의 최근 대회도 같은 목록을 읽는다. */
export function prependGroupContest(cache: ApolloCache, groupId: string, contest: ContestListItemFragment) {
  cache.updateQuery({ query: GroupDocument, variables: { id: groupId } }, (data) =>
    data
      ? {
          group: {
            ...data.group,
            contests: [contest, ...data.group.contests.filter((item) => item.id !== contest.id)],
          },
        }
      : undefined,
  );
}
