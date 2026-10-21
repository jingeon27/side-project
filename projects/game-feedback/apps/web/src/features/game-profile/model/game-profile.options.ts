import { queryOptions, skipToken } from '@tanstack/react-query';
import { compact } from 'es-toolkit';

import { fetchGameAccounts, fetchGameProfile } from '../api/game-profile.api';

export function gameAccountListOptions(userId?: string) {
  return queryOptions({
    queryKey: compact(['accounts', userId]),
    queryFn: userId ? ({ signal }) => fetchGameAccounts({ signal }) : skipToken,
  });
}
function profileScope() {
  return queryOptions({ queryKey: ['game-profile'], queryFn: skipToken });
}
function createGameProfileOptions(playerTag: string) {
  return queryOptions({
    queryKey: [...profileScope().queryKey, playerTag],
    queryFn: ({ signal }) => fetchGameProfile({ playerTag, signal }),
    staleTime: 0,
  });
}
export function gameProfileOptions(playerTag: string): ReturnType<typeof createGameProfileOptions>;
export function gameProfileOptions(
  playerTag?: string,
): ReturnType<typeof createGameProfileOptions> | ReturnType<typeof profileScope>;
export function gameProfileOptions(playerTag?: string) {
  return playerTag ? createGameProfileOptions(playerTag) : profileScope();
}
