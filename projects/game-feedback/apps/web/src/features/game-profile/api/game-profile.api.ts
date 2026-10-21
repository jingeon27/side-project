import { getGameProfile, listGameAccounts, saveGameAccount } from '@game-feedback/sdk';

import { withApiError, type GameProfile } from '@/shared/api';

export function fetchGameProfile({
  playerTag,
  signal,
}: {
  playerTag: string;
  signal?: AbortSignal;
}): Promise<GameProfile> {
  // 생성 SDK의 경로 보간에는 인코딩이 없어 태그의 #이 URL fragment가 되지 않게 한다.
  return withApiError(getGameProfile(encodeURIComponent(playerTag), { signal }));
}
export function fetchGameAccounts({ signal }: { signal?: AbortSignal } = {}): Promise<GameProfile[]> {
  return withApiError(listGameAccounts({ signal }));
}
export function postGameAccount(body: { playerTag: string }): Promise<GameProfile> {
  return withApiError(saveGameAccount(body));
}
