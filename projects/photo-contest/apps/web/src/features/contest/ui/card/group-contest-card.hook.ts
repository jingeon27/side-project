import { useFragment } from '@apollo/client/react';

import { GroupContestCardFragmentDoc } from '@/shared/api/generated';

/** 진행 중·지난 대회 카드가 같은 대회 fragment를 읽는다. */
export function useGroupContestCard(id: string) {
  return useFragment({
    fragment: GroupContestCardFragmentDoc,
    fragmentName: 'GroupContestCard',
    from: { __typename: 'GroupContest', id },
  });
}
