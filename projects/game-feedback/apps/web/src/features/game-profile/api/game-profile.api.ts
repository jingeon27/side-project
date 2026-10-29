import { getGameProfile, listGameAccounts, saveGameAccount } from '@game-feedback/sdk';

import { withApiError, type GameProfile } from '@/shared/api';

export function fetchGameProfile({
  playerTag,
  signal,
}: {
  playerTag: string;
  signal?: AbortSignal;
}): Promise<GameProfile> {
  // SDK는 경로 세그먼트의 #을 거부한다. API 계약(PlayerTagSchema)이 # 없는 태그를 같은 태그로 정규화한다.
  return withApiError(getGameProfile(playerTag.trim().replace(/^#/, ''), { signal }));
}
export function fetchGameAccounts({ signal }: { signal?: AbortSignal } = {}): Promise<GameProfile[]> {
  return withApiError(listGameAccounts({ signal }));
}
export function postGameAccount(body: { playerTag: string }): Promise<GameProfile> {
  return withApiError(saveGameAccount(body));
}
