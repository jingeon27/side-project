import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { BattleMemory, type BattleSituation, type FieldUnit } from '../../core/battle/battle-state.ts';
import { COUNTERPUSH_DECK, COUNTERPUSH_EVOLUTIONS } from '../../core/deck.ts';
import { loadProfile, type Profile } from '../../core/profile.ts';
import { analyzeEpisode, lossAnalysisSchema } from './loss-analysis.ts';

const fixture = { directory: '', profile: undefined as Profile | undefined };
beforeEach(async () => {
  fixture.directory = await mkdtemp(join(tmpdir(), 'clash-loss-'));
  fixture.profile = await loadProfile(
    fileURLToPath(new URL('../../../../../profiles/counterpush.json', import.meta.url)),
  );
});
afterEach(async () => {
  await rm(fixture.directory, { recursive: true, force: true });
});

const situation = (at: number, elixir: number, enemies: FieldUnit[] = []): BattleSituation => {
  const observed = new BattleMemory([...COUNTERPUSH_DECK], COUNTERPUSH_EVOLUTIONS).observe({
    at,
    amount: elixir,
    hand: ['knight', 'furnace', 'poison', 'skeletons'],
    allies: [],
    enemies: [],
    inputPending: false,
  });
  return {
    ...observed,
    own: { ...observed.own, elixir: { min: elixir, max: elixir } },
    opponent: { ...observed.opponent, units: enemies },
  };
};
const knightOnOurSide = (profile: Profile): FieldUnit => ({
  card: 'knight',
  x: 270,
  y: profile.riverY + 60,
  confidence: 0.95,
});
const lines = (rows: unknown[]) => rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
const wait = { id: 0, slot: 0, card: null, target: { x: 0, y: 0 }, description: 'wait' };
const knight = { id: 1, slot: 1, card: 'knight', target: { x: 270, y: 380 }, description: 'knight' };
const prediction = (frame: number, at: number, choice: number, state: BattleSituation) => ({
  type: 'prediction',
  at,
  frame,
  text: JSON.stringify({ choice }),
  candidates: [wait, knight],
  situation: state,
  elapsedMs: 40 + frame,
  captureToDecisionMs: 300 + frame,
  behavior: { policy: 'fast', version: 7 },
});

it('marks waits at full elixir and under attack and measures the answer time', async () => {
  const profile = fixture.profile!;
  const enemy = knightOnOurSide(profile);
  // 0~3초는 엘릭서 10, 4~8초는 상대 기사가 우리 진영에 있다. 9.5초에 기사를 내 막는다.
  const states = [0, 1, 2, 3].map((second) => situation(second * 1000, 10));
  const attacked = [4, 5, 6, 7, 8].map((second) => situation(second * 1000, 6, [enemy]));
  await writeFile(
    join(fixture.directory, 'states.jsonl'),
    lines(
      [...states, ...attacked].map((state) => ({
        version: 1,
        image: 'frame.png',
        capturedAt: state.at,
        inputPending: false,
        situation: state,
      })),
    ),
  );
  await writeFile(
    join(fixture.directory, 'events.jsonl'),
    lines([
      { type: 'match_start', at: 0, controllerVersion: 4 },
      prediction(1, 2_000, 0, states[2]!),
      prediction(2, 5_000, 0, attacked[1]!),
      prediction(3, 9_000, 1, attacked[4]!),
      { type: 'input_sent', at: 9_200 },
      { type: 'input_check', at: 9_500, frame: 3, confirmed: true },
      { type: 'rejected', at: 9_600, frame: 4, reason: 'decision_deadline_exceeded' },
      { type: 'result', at: 60_000, blue: 0, red: 3, outcome: 'loss' },
    ]),
  );
  const analysis = await analyzeEpisode(fixture.directory, profile);
  expect(lossAnalysisSchema.parse(analysis)).toEqual(analysis);
  expect(analysis).toMatchObject({
    controllerVersion: 4,
    policyVersion: 7,
    result: 'loss',
    crowns: { own: 0, enemy: 3 },
    decisions: 3,
    elixir: { fullSeconds: 3, waitedAtFull: 1 },
    attacks: { windows: 1, undefended: 0, waitedUnderAttack: 1, reactionMedianMs: 5_500 },
    inputs: { confirmed: 1, unconfirmed: 0, rejected: { decision_deadline_exceeded: 1 } },
    latency: { decisionMedianMs: 42, captureMedianMs: 302 },
    flaggedDecisions: [
      { frame: 1, reasons: ['waited_at_full_elixir'] },
      { frame: 2, reasons: ['waited_under_attack'] },
    ],
  });
  expect(JSON.parse(await readFile(join(fixture.directory, 'loss-analysis.json'), 'utf8'))).toEqual(analysis);
});

it('counts an attack that ended without any card as undefended', async () => {
  const profile = fixture.profile!;
  const attacked = [1, 2, 3, 4].map((second) => situation(second * 1000, 7, [knightOnOurSide(profile)]));
  await writeFile(
    join(fixture.directory, 'states.jsonl'),
    lines(
      attacked.map((state) => ({
        version: 1,
        image: 'frame.png',
        capturedAt: state.at,
        inputPending: false,
        situation: state,
      })),
    ),
  );
  await writeFile(
    join(fixture.directory, 'events.jsonl'),
    lines([
      { type: 'match_start', at: 0, controllerVersion: 3 },
      { type: 'result', at: 20_000, blue: 1, red: 2, outcome: 'loss' },
    ]),
  );
  const analysis = await analyzeEpisode(fixture.directory, profile);
  expect(analysis.attacks).toEqual({
    windows: 1,
    undefended: 1,
    waitedUnderAttack: 0,
    reactionMedianMs: null,
  });
  expect(analysis.policyVersion).toBeNull();
});
