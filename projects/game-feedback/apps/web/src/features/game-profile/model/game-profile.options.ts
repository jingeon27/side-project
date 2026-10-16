import { queryOptions, skipToken } from '@tanstack/react-query';
import { compact } from 'es-toolkit';
import { fetchGameAccounts, fetchGameProfile } from '../api/game-profile.api';

export function gameAccountListOptions(userId?: string) {
  return queryOptions({
    queryKey: compact(['accounts', userId]),
    queryFn: userId ? ({ signal }) => fetchGameAccounts({ signal }) : skipToken,
  });
}
export function gameProfileOptions(playerTag?: string) {
  return queryOptions({
    queryKey: compact(['game-profile', playerTag]),
    queryFn: playerTag ? ({ signal }) => fetchGameProfile({ playerTag, signal }) : skipToken,
    staleTime: 0,
  });
}
