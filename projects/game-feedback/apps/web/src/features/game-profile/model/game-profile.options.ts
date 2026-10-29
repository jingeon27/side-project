import { queryOptions, skipToken } from '@tanstack/react-query';

import { fetchGameAccounts, fetchGameProfile } from '../api/game-profile.api';

function accountScope() {
  return queryOptions({ queryKey: ['accounts'], queryFn: skipToken });
}
function createGameAccountListOptions(userId: string) {
  return queryOptions({
    queryKey: [...accountScope().queryKey, userId],
    queryFn: ({ signal }) => fetchGameAccounts({ signal }),
  });
}
export function gameAccountListOptions(userId: string): ReturnType<typeof createGameAccountListOptions>;
export function gameAccountListOptions(
  userId?: string,
): ReturnType<typeof createGameAccountListOptions> | ReturnType<typeof accountScope>;
export function gameAccountListOptions(userId?: string) {
  return userId ? createGameAccountListOptions(userId) : accountScope();
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
