import { queryOptions, skipToken } from '@tanstack/react-query';
import { compact } from 'es-toolkit';

import { fetchFollowStatus } from '../api/follow.api';

/** 두 id가 모두 있을 때만 조회한다. 인자 없이 부르면 `['user-follow']` 무효화 prefix다. */
export function followStatusOptions(viewerId?: string, userId?: string) {
  return queryOptions({
    queryKey: compact(['user-follow', viewerId, userId]),
    queryFn: viewerId && userId ? ({ signal }) => fetchFollowStatus(userId, signal) : skipToken,
    staleTime: 0,
  });
}
