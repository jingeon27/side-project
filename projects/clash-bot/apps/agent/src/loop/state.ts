import { readFileSync } from 'node:fs';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import dayjs from 'dayjs';
import { z } from 'zod';

import { atomicWrite } from '../shared/assets.ts';
import { readOptionalJsonFile } from '../shared/json-file.ts';

// 감독의 주기, 자가대국 실행 인자와 재시작 한도다. 단일 기준은 contracts/self-improvement.json이다.
export const SELF_IMPROVEMENT = z
  .strictObject({
    format: z.literal('clash-self-improvement-v1'),
    tickSeconds: z.int().positive(),
    arena: z.strictObject({
      start: z.array(z.string()),
      niceness: z.int().min(0).max(19),
      restartDelaysSeconds: z.array(z.int().nonnegative()).min(1),
      failureWindowHours: z.number().positive(),
      maxFailures: z.int().positive(),
    }),
    rulesCheckHours: z.number().positive(),
    reportHours: z.number().positive(),
  })
  .parse(JSON.parse(readFileSync(new URL('../../contracts/self-improvement.json', import.meta.url), 'utf8')));
export type SelfImprovementSettings = typeof SELF_IMPROVEMENT;

export const loopDirectory = (dataDir: string) => join(dataDir, 'loop');
export const loopControl = (dataDir: string) => join(dataDir, 'loop/control');

// state.json: 루프가 시작한 자가대국, 실패 기록, 마지막 인계와 정기 작업 시각이다.
export const loopStateSchema = z.strictObject({
  format: z.literal('clash-self-improvement-state-v1'),
  arena: z.strictObject({
    startedPid: z.int().positive().nullable(),
    failures: z.array(z.iso.datetime()),
    lastError: z.string().nullable(),
    blocked: z.boolean(),
    paused: z.boolean(),
  }),
  handoff: z
    .strictObject({
      league: z.string(),
      version: z.int().nonnegative(),
      weightsSHA256: z.string().length(64),
      at: z.iso.datetime(),
    })
    .nullable(),
  rulesCheckedAt: z.iso.datetime().nullable(),
  reportedAt: z.iso.datetime(),
});
export type LoopState = z.infer<typeof loopStateSchema>;

// 새로 시작할 때는 사용자가 다시 돌리라고 한 것이므로 일시정지와 실패 한도를 지운다. 인계와 일정은 잇는다.
export const startedState = (stored: LoopState | null, now: string): LoopState => ({
  format: 'clash-self-improvement-state-v1',
  arena: { startedPid: null, failures: [], lastError: null, blocked: false, paused: false },
  handoff: stored?.handoff ?? null,
  rulesCheckedAt: stored?.rulesCheckedAt ?? null,
  reportedAt: stored?.reportedAt ?? now,
});

export const readLoopState = (dataDir: string) =>
  readOptionalJsonFile(join(loopControl(dataDir), 'state.json'), loopStateSchema);

export const saveLoopState = (dataDir: string, state: LoopState) =>
  atomicWrite(
    join(loopControl(dataDir), 'state.json'),
    JSON.stringify(loopStateSchema.parse(state), null, 2) + '\n',
  );

const eventSchema = z.looseObject({ at: z.iso.datetime(), type: z.string() });
export type LoopEvent = z.infer<typeof eventSchema>;

export async function recordEvent(dataDir: string, event: LoopEvent) {
  await mkdir(loopDirectory(dataDir), { recursive: true, mode: 0o700 });
  await appendFile(
    join(loopDirectory(dataDir), 'events.jsonl'),
    JSON.stringify(eventSchema.parse(event)) + '\n',
    {
      mode: 0o600,
    },
  );
}

export async function eventsSince(dataDir: string, from: string) {
  const text = await readFile(join(loopDirectory(dataDir), 'events.jsonl'), 'utf8').catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return '';
      throw error;
    },
  );
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => eventSchema.parse(JSON.parse(line)))
    .filter((event) => dayjs(event.at).isAfter(dayjs(from)));
}
