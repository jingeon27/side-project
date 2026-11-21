import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Dayjs } from 'dayjs';
import { z } from 'zod';

import type { ArenaChampion } from '../arena/process.ts';
import { atomicWrite } from '../shared/assets.ts';
import { SIMULATION_CANDIDATE_FILE, simulationCandidateSchema, trophyControl } from '../trophy/protocol.ts';
import { loopDirectory } from './state.ts';

// 리그는 챔피언이 바뀔 때 같은 파일을 덮어쓴다. 가중치 해시 이름으로 복사해 둔 사본을 트로피에 넘겨,
// 트로피가 가져오기 전에 다음 챔피언이 생겨도 넘긴 정책과 해시가 어긋나지 않게 한다.
export async function handOff(dataDir: string, champion: ArenaChampion, now: Dayjs) {
  const text = await readFile(champion.policy, 'utf8');
  const { weightsSHA256 } = z.looseObject({ weightsSHA256: z.string() }).parse(JSON.parse(text));
  if (weightsSHA256 !== champion.weightsSHA256) throw new Error('챔피언 정책이 읽는 도중 바뀌었습니다.');
  const directory = join(loopDirectory(dataDir), 'simulation-champions');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const copy = join(directory, `${weightsSHA256}.json`);
  await atomicWrite(copy, text);
  const offer = simulationCandidateSchema.parse({
    format: 'trophy-simulation-candidate-v1',
    policy: copy,
    weightsSHA256,
    league: champion.league,
    version: champion.version,
    publishedAt: now.toISOString(),
  });
  await mkdir(trophyControl(dataDir), { recursive: true, mode: 0o700 });
  await atomicWrite(
    join(trophyControl(dataDir), SIMULATION_CANDIDATE_FILE),
    JSON.stringify(offer, null, 2) + '\n',
  );
  return { league: champion.league, version: champion.version, weightsSHA256, at: offer.publishedAt };
}
