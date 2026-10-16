import { queryOptions, skipToken } from '@tanstack/react-query';
import { compact } from 'es-toolkit';
import { fetchBlockedUsers, fetchPublicProfile } from '../api/user.api';

export function blockListOptions(userId?: string) {
  return queryOptions({
    queryKey: compact(['blocks', userId]),
    queryFn: userId ? ({ signal }) => fetchBlockedUsers({ signal }) : skipToken,
  });
}

export function profileOptions(id?: string) {
  return queryOptions({
    queryKey: id ? ['public-profile', id] : ['public-profile'],
    queryFn: id ? () => fetchPublicProfile(id) : skipToken,
    staleTime: 0,
  });
}
