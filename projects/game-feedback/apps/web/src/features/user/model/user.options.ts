import { queryOptions, skipToken } from '@tanstack/react-query';
import { compact } from 'es-toolkit';
import { fetchBlockedUsers } from '../api/user.api';

export function blockListOptions(userId?: string) {
  return queryOptions({
    queryKey: compact(['blocks', userId]),
    queryFn: userId ? ({ signal }) => fetchBlockedUsers({ signal }) : skipToken,
  });
}
