import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { Dayjs } from 'dayjs';
import { pick } from 'es-toolkit';
import { z } from 'zod';

import { arenaControl } from '../arena/process.ts';
import { atomicWrite } from '../shared/assets.ts';
import { readOptionalJsonFile } from '../shared/json-file.ts';
import { trophyControl } from '../trophy/protocol.ts';
import { eventsSince, loopDirectory, type LoopState } from './state.ts';

// 계획(docs/self-improvement-plan.md)에 있지만 아직 라벨링이 없어 자동으로 돌지 않는 작업이다.
const NOT_YET_AUTOMATED = [
  'real_screen_label_queue',
  'perception_retraining',
  'measured_simulator_perception_noise',
  'simulator_and_real_ranking_check',
];

const statusOf = (path: string) => readOptionalJsonFile(path, z.record(z.string(), z.unknown()));

// 지난 보고 뒤의 사건과 자가대국·트로피의 현재 상태를 한 파일로 남긴다. 성적 향상을 판정하지 않는다.
export async function writeReport(dataDir: string, state: LoopState, now: Dayjs) {
  const arena = await statusOf(join(arenaControl(dataDir), 'status.json'));
  const trophy = await statusOf(join(trophyControl(dataDir), 'status.json'));
  const report = {
    format: 'clash-self-improvement-report-v1',
    from: state.reportedAt,
    to: now.toISOString(),
    arena: arena && pick(arena, ['phase', 'completedGenerations', 'completedGames', 'error']),
    trophy:
      trophy &&
      pick(trophy, [
        'phase',
        'trainingGames',
        'evaluationGames',
        'updates',
        'promotions',
        'champion',
        'simulation',
        'lastEvaluation',
      ]),
    loop: { arena: state.arena, handoff: state.handoff, rulesCheckedAt: state.rulesCheckedAt },
    events: await eventsSince(dataDir, state.reportedAt),
    notYetAutomated: NOT_YET_AUTOMATED,
  };
  const directory = join(loopDirectory(dataDir), 'reports');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${now.format('YYYY-MM-DD-HHmm')}.json`);
  await atomicWrite(path, JSON.stringify(report, null, 2) + '\n');
  return path;
}
