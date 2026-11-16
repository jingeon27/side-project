import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { BattleMemory } from '../../core/battle/battle-state.ts';
import { COUNTERPUSH_DECK, COUNTERPUSH_EVOLUTIONS } from '../../core/deck.ts';
import { DEFAULT_PROFILE } from '../../core/profile.ts';
import type { LossAnalysis } from './loss-analysis.ts';
import { learningReport } from './report.ts';

const fixture = { dataDir: '' };
beforeEach(async () => {
  fixture.dataDir = await mkdtemp(join(tmpdir(), 'clash-report-'));
});
afterEach(async () => {
  await rm(fixture.dataDir, { recursive: true, force: true });
});

const run = async (name: string, files: Record<string, string>) => {
  const directory = join(fixture.dataDir, 'counterpush/runs', name);
  await mkdir(directory, { recursive: true });
  await Promise.all(Object.entries(files).map(([file, body]) => writeFile(join(directory, file), body)));
};
const cached: LossAnalysis = {
  format: 'counterpush-loss-analysis-v1',
  controllerVersion: 4,
  policyVersion: 7,
  result: 'win',
  crowns: { own: 2, enemy: 1 },
  decisions: 30,
  elixir: { fullSeconds: 4, waitedAtFull: 2 },
  attacks: { windows: 3, undefended: 1, waitedUnderAttack: 2, reactionMedianMs: 800 },
  inputs: { confirmed: 9, unconfirmed: 1, rejected: {} },
  latency: { decisionMedianMs: 1, captureMedianMs: 320 },
  flaggedDecisions: [],
};

it('groups finished matches by controller and policy version and skips unfinished ones', async () => {
  await run('2026-11-16T01-00-00.000Z', {
    'summary.json': JSON.stringify({ seenBattle: true, result: 'win' }),
    'loss-analysis.json': JSON.stringify(cached),
  });
  const situation = new BattleMemory([...COUNTERPUSH_DECK], COUNTERPUSH_EVOLUTIONS).observe({
    at: 1_000,
    amount: 10,
    hand: ['knight', 'furnace', 'poison', 'skeletons'],
    allies: [],
    enemies: [],
    inputPending: false,
  });
  await run('2026-11-16T02-00-00.000Z', {
    'summary.json': JSON.stringify({ seenBattle: true, result: 'loss' }),
    'states.jsonl':
      JSON.stringify({ version: 1, image: 'a.png', capturedAt: 1_000, inputPending: false, situation }) +
      '\n',
    'events.jsonl':
      [
        { type: 'match_start', at: 0, controllerVersion: 4 },
        { type: 'result', at: 9_000, blue: 0, red: 1, outcome: 'loss' },
      ]
        .map((row) => JSON.stringify(row))
        .join('\n') + '\n',
  });
  await run('2026-11-16T03-00-00.000Z', {
    'summary.json': JSON.stringify({ seenBattle: false, result: 'unknown' }),
  });

  const report = await learningReport(fixture.dataDir, DEFAULT_PROFILE, 50);
  expect(report).toMatchObject({ runs: 3, analyzed: 2 });
  expect(Object.keys(report.groups).toSorted()).toEqual(['controller 4 policy 7', 'controller 4 policy ?']);
  expect(report.groups['controller 4 policy 7']).toMatchObject({
    matches: 1,
    results: { win: 1 },
    crowns: { own: 2, enemy: 1 },
    perMatch: { fullElixirSeconds: 4, waitedAtFull: 2, undefendedAttacks: 1, waitedUnderAttack: 2 },
    reactionMedianMs: 800,
    unconfirmedInputRate: 0.1,
    decisionMedianMs: 1,
  });
  expect(report.groups['controller 4 policy ?']).toMatchObject({
    matches: 1,
    results: { loss: 1 },
    unconfirmedInputRate: null,
  });
});
