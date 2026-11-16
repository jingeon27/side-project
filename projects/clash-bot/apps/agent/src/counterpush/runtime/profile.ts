import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProfile } from '../../shared/config.ts';
import { COUNTERPUSH_DECK } from './browser.ts';

// 화면 좌표는 저장소의 Counterpush 프로필 하나가 소유한다. 다른 좌표가 필요할 때만 --profile로 지정한다.
const REPOSITORY_PROFILE = fileURLToPath(
  new URL('../../../../../profiles/counterpush.json', import.meta.url),
);

export async function loadCounterpushProfile(override?: string) {
  const profile = await loadProfile(override ? resolve(override) : REPOSITORY_PROFILE);
  if (profile.deck.toSorted().join(',') !== [...COUNTERPUSH_DECK].toSorted().join(','))
    throw new Error('Counterpush 프로필에는 지정된 8장 덱이 필요합니다.');
  return profile;
}
