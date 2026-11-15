import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { atomicWrite } from '../assets.ts';
import { loadProfile } from '../config.ts';
import { COUNTERPUSH_DECK } from './browser.ts';

export async function loadCounterpushProfile(dataDir: string, override?: string) {
  const local = join(dataDir, 'counterpush/profile.json');
  if (!override) {
    const existing = await readFile(local, 'utf8').catch((error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    });
    if (!existing)
      await atomicWrite(
        local,
        await readFile(fileURLToPath(new URL('../../../../profiles/counterpush.json', import.meta.url))),
      );
  }
  const profile = await loadProfile(resolve(override ?? local));
  if (profile.deck.toSorted().join(',') !== [...COUNTERPUSH_DECK].toSorted().join(','))
    throw new Error('Counterpush 프로필에는 지정된 8장 덱이 필요합니다.');
  return profile;
}
