import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { UnitScan } from '../../core/battle/observation.ts';
import type { CardId } from '../../core/cards.ts';
import type { Point } from '../../core/geometry.ts';
import type { QwenAction } from '../../core/policy/actions.ts';
import {
  ACTION_SIZE,
  FAST_POLICY,
  FastPolicy,
  STATE_SIZE,
  type FastWeights,
} from '../../core/policy/fast-policy.ts';
import { loadProfile, type Profile } from '../../core/profile.ts';
import type { LearningClient, LearningDecisionRequest } from '../../qwen/learning-client.ts';
import { parseBrowserResult, type BrowserPhase, type CounterpushBrowser } from '../browser/browser.ts';
import { counterpushBarReading, counterpushElixir } from '../perception/elixir.ts';
import { loadHandReferences } from '../perception/hand-references.ts';
import type { CounterpushVisionClient } from '../perception/vision-client.ts';
import { controllerFor, fastController, type Controller } from './controllers.ts';
import { playCounterpushEpisode } from './episode.ts';

const PURPLE = { r: 170, g: 60, b: 210 };
const EMPTY_SCAN: UnitScan = { entities: [], markers: [], elapsed_ms: 5, allies: [] };
const ABILITY_PORTRAIT = { left: 317, top: 477, size: 30 };
const START: CardId[] = ['knight', 'furnace', 'poison', 'skeletons'];

type Screen = { hand: CardId[]; elixir: number; ability?: boolean };

async function battleScreen(profile: Profile, screen: Screen) {
  const references = (await loadHandReferences()).references.filter((item) => item.state === 'normal');
  const art = (card: CardId) => references.find((item) => item.card === card)!.bytes;
  const fill = Math.min(profile.elixir.width, Math.ceil(screen.elixir * 25.6 - 18) + 1);
  const slots = await Promise.all(
    screen.hand.map(async (card, index) => ({
      input: await sharp(art(card))
        .resize(profile.hand[index]!.width, profile.hand[index]!.height, { fit: 'fill' })
        .png()
        .toBuffer(),
      left: profile.hand[index]!.x,
      top: profile.hand[index]!.y,
    })),
  );
  const bar = await sharp({
    create: { width: fill, height: profile.elixir.height, channels: 3, background: PURPLE },
  })
    .png()
    .toBuffer();
  const button = screen.ability
    ? [
        {
          input: await sharp(
            await readFile(new URL('../../../assets/counterpush/ice-wizard-ability.png', import.meta.url)),
          )
            .resize(ABILITY_PORTRAIT.size, ABILITY_PORTRAIT.size, { fit: 'fill' })
            .png()
            .toBuffer(),
          left: ABILITY_PORTRAIT.left,
          top: ABILITY_PORTRAIT.top,
        },
      ]
    : [];
  return sharp({ create: { width: 368, height: 652, channels: 3, background: '#20262c' } })
    .composite([...slots, { input: bar, left: profile.elixir.x, top: profile.elixir.y }, ...button])
    .png()
    .toBuffer();
}

type Decision = { pick: 'wait' | 'ability' | CardId; elapsedMs?: number; show?: string; delayMs?: number };
type Scenario = {
  controllerVersion: 1 | 3;
  screens: Record<string, Screen>;
  decisions: Decision[];
  // Screen shown after the n-th card input; without one the input leaves the screen unchanged.
  afterPlay?: Record<number, string>;
  afterAbility?: string;
  // After this many inputs, the result appears once the given number of further captures happen.
  end?: { inputs: number; captures: number };
};

// 브라우저·인식 워커·Qwen만 가짜로 두고 실제 손패·엘릭서·능력 버튼 판독과 기록을 그대로 실행한다.
// 대본의 판단을 모두 쓰면 다음 판단은 대기를 고르고 결과 화면으로 넘어간다.
function scenarioMatch(profile: Profile, scenario: Scenario) {
  const screens = Object.fromEntries(
    Object.entries(scenario.screens).map(([name, screen]) => [name, battleScreen(profile, screen)]),
  );
  const match = {
    phase: 'setup' as BrowserPhase,
    screen: 'start',
    capturesUntilResult: Infinity,
    inputs: 0,
    plays: [] as Array<{ slot: number; target: Point }>,
    abilities: 0,
    requests: [] as LearningDecisionRequest[],
    pendingDecision: false,
    scansWhileDeciding: 0,
  };
  const afterInput = (screen: string | undefined) => {
    if (screen) match.screen = screen;
    match.inputs++;
    if (scenario.end && match.inputs === scenario.end.inputs)
      match.capturesUntilResult = scenario.end.captures;
  };
  const browser = {
    phase: async () => match.phase,
    startMatch: async () => {
      match.phase = 'battle';
    },
    capture: async () => {
      if (--match.capturesUntilResult <= 0) match.phase = 'result';
      return { image: await screens[match.screen]!, capturedAt: Date.now() };
    },
    play: async (_profile: Profile, slot: number, target: Point) => {
      match.plays.push({ slot, target });
      afterInput(scenario.afterPlay?.[match.plays.length]);
      return true;
    },
    activateAbility: async () => {
      match.abilities++;
      afterInput(scenario.afterAbility);
      return true;
    },
    result: async () =>
      match.phase === 'result' ? parseBrowserResult('Crowns: you 1, the opponent 3') : null,
    screenshot: async (path: string) => writeFile(path, 'result'),
  } as unknown as CounterpushBrowser;
  const vision = {
    scan: async () => {
      if (match.pendingDecision) match.scansWhileDeciding++;
      return EMPTY_SCAN;
    },
    absent: async () => ({ absent: false }),
    guard: async () => ({ graveyardPresence: [0, 0] }),
  } as unknown as CounterpushVisionClient;
  const pick = (candidates: QwenAction[], decision: Decision) => {
    const chosen = candidates.find((action) =>
      decision.pick === 'wait'
        ? action.id === 0
        : decision.pick === 'ability'
          ? action.kind === 'ability'
          : action.card === decision.pick && action.kind !== 'ability',
    );
    if (!chosen) throw new Error(`no candidate for ${decision.pick}`);
    return chosen;
  };
  const client = {
    status: async () => ({ controller_version: scenario.controllerVersion, version: 7 }),
    choose: async (request: LearningDecisionRequest) => {
      match.requests.push(request);
      const decision = scenario.decisions[match.requests.length - 1];
      match.pendingDecision = true;
      if (decision?.delayMs) await new Promise((resolve) => setTimeout(resolve, decision.delayMs));
      match.pendingDecision = false;
      if (!decision) match.capturesUntilResult = 1;
      if (decision?.show) match.screen = decision.show;
      return {
        text: JSON.stringify({ choice: pick(request.candidates, decision ?? { pick: 'wait' }).id }),
        elapsedMs: decision?.elapsedMs ?? 120,
        peakGb: 16,
        behavior: { version: 7, controller_version: scenario.controllerVersion },
      };
    },
  } as unknown as LearningClient;
  return { match, browser, vision, client };
}

const readLines = async (path: string) =>
  (await readFile(path, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);

const fixture = { dataDir: '', profile: undefined as Profile | undefined };
beforeEach(async () => {
  fixture.dataDir = await mkdtemp(join(tmpdir(), 'clash-episode-'));
  fixture.profile = await loadProfile(
    fileURLToPath(new URL('../../../../../profiles/counterpush.json', import.meta.url)),
  );
});
afterEach(async () => {
  await rm(fixture.dataDir, { recursive: true, force: true });
});

async function play(scenario: Scenario, controller?: Controller) {
  const fake = scenarioMatch(fixture.profile!, scenario);
  const outcome = await playCounterpushEpisode({
    browser: fake.browser,
    controller: controller ?? (await controllerFor(fake.client)),
    vision: fake.vision,
    dataDir: fixture.dataDir,
    profile: fixture.profile!,
    signal: new AbortController().signal,
    report: async () => {},
    persistPatterns: false,
  });
  const events = await readLines(join(outcome.directory, 'events.jsonl'));
  return { fake, outcome, events, types: events.map((event) => event.type) };
}

it('reads the synthetic screens like a real battle', async () => {
  const profile = fixture.profile!;
  const reading = await counterpushBarReading(
    await battleScreen(profile, { hand: START, elixir: 7 }),
    profile,
  );
  expect(counterpushElixir(reading, profile).value).toBe(7);
  expect(reading.elixirConfidence).toBeGreaterThanOrEqual(0.9);
});

it('keeps public-field perception running while controller 3 waits for a model decision', async () => {
  const played = await play({
    controllerVersion: 3,
    screens: { start: { hand: START, elixir: 7 } },
    decisions: [{ pick: 'wait', delayMs: 650 }],
  });
  expect(played.fake.match.scansWhileDeciding).toBeGreaterThan(0);
  expect(played.outcome.result).toBe('loss');
});

describe.each([
  {
    controllerVersion: 3 as const,
    decisions: [{ pick: 'wait' }, { pick: 'wait', elapsedMs: 1500 }, { pick: 'knight' }],
  },
  { controllerVersion: 1 as const, decisions: [{ pick: 'wait' }, { pick: 'knight' }] },
] satisfies Array<{ controllerVersion: 1 | 3; decisions: Decision[] }>)(
  'a recorded Counterpush match with controller $controllerVersion',
  ({ controllerVersion, decisions }) => {
    it('records decisions, a confirmed card input and the verified result', { timeout: 30_000 }, async () => {
      const { fake, outcome, events, types } = await play({
        controllerVersion,
        screens: {
          start: { hand: START, elixir: 7 },
          after: { hand: ['goblin_hut', 'furnace', 'poison', 'skeletons'], elixir: 4 },
        },
        decisions,
        afterPlay: { 1: 'after' },
        end: { inputs: 1, captures: 1 },
      });

      expect(outcome).toMatchObject({
        result: 'loss',
        actions: 1,
        confirmed: 1,
        abilityActions: 0,
        seenBattle: true,
        opponentActions: 0,
        learningEligible: true,
      });
      expect(types).toEqual(
        controllerVersion === 3
          ? [
              'match_start',
              'prediction',
              'wait_check',
              'prediction',
              'rejected',
              'prediction',
              'input_sent',
              'input_check',
              'result',
            ]
          : ['match_start', 'prediction', 'wait_check', 'prediction', 'input_sent', 'input_check', 'result'],
      );
      expect(events[0]).toMatchObject({ controllerVersion, initialPhase: 'setup', deck: expect.any(Array) });
      if (controllerVersion === 3)
        expect(events[4]).toMatchObject({ reason: 'decision_deadline_exceeded', elapsedMs: 1500 });
      const input = events.find((event) => event.type === 'input_sent')!;
      const knight = fake.match.requests.at(-1)!.candidates.find((action) => action.card === 'knight')!;
      expect(fake.match.plays).toEqual([{ slot: knight.slot, target: knight.target }]);
      expect(input.action).toMatchObject({ slot: knight.slot - 1, card: 'knight' });
      expect(events.find((event) => event.type === 'input_check')).toMatchObject({
        confirmed: true,
        changed: true,
        spent: 3,
        expectedCost: 3,
      });
      expect(events.at(-1)).toMatchObject({
        type: 'result',
        blue: 1,
        red: 3,
        outcome: 'loss',
        readings: ['Crowns: you 1, the opponent 3', 'Crowns: you 1, the opponent 3'],
      });
      const predictions = events.filter((event) => event.type === 'prediction');
      expect(predictions.map((event) => event.frame)).toEqual(predictions.map((_, index) => index + 1));
      for (const request of fake.match.requests) {
        expect(request.controllerVersion).toBe(controllerVersion);
        expect(request.candidates.some((action) => action.id === 0)).toBe(true);
      }

      const summary = JSON.parse(await readFile(join(outcome.directory, 'summary.json'), 'utf8'));
      expect(summary).toMatchObject({
        result: 'loss',
        blue: 1,
        red: 3,
        actions: 1,
        confirmed: 1,
        decisions: decisions.length,
      });
      const observations = JSON.parse(await readFile(join(outcome.directory, 'observations.json'), 'utf8'));
      expect(observations).toMatchObject({ version: 1, actor: 'red_top', observations: [] });
      const states = await readLines(join(outcome.directory, 'states.jsonl'));
      expect(states.length).toBeGreaterThanOrEqual(decisions.length);
      expect(states.every((row) => row.version === 1 && typeof row.situation === 'object')).toBe(true);
      expect((await readLines(join(outcome.directory, 'vision.jsonl'))).length).toBe(states.length);
      expect(await readdir(outcome.directory)).toEqual(
        expect.arrayContaining(['0001.png', 'frames', 'result-page.png']),
      );
    });
  },
);

describe('card and ability inputs', () => {
  it('does not send a decision whose hand changed before the input', { timeout: 30_000 }, async () => {
    const { fake, outcome, types, events } = await play({
      controllerVersion: 3,
      screens: {
        start: { hand: START, elixir: 7 },
        swapped: { hand: ['goblin_hut', 'furnace', 'poison', 'skeletons'], elixir: 7 },
      },
      decisions: [{ pick: 'knight', show: 'swapped' }],
    });
    expect(fake.match.plays).toEqual([]);
    expect(types).toEqual(['match_start', 'prediction', 'rejected', 'prediction', 'wait_check', 'result']);
    expect(events[2]).toMatchObject({ reason: 'stale_or_changed_screen', frame: 1 });
    expect(outcome).toMatchObject({ actions: 0, confirmed: 0, learningEligible: true });
  });

  it('stops sending inputs after three unconfirmed card inputs', { timeout: 30_000 }, async () => {
    const { fake, outcome, types, events } = await play({
      controllerVersion: 3,
      screens: { start: { hand: START, elixir: 7 } },
      decisions: [{ pick: 'knight' }, { pick: 'knight' }, { pick: 'knight' }],
      end: { inputs: 3, captures: 6 },
    });
    expect(fake.match.plays).toHaveLength(3);
    const checks = events.filter((event) => event.type === 'input_check');
    expect(checks).toHaveLength(3);
    expect(checks.every((event) => event.confirmed === false && event.checks === 4)).toBe(true);
    expect(types.filter((type) => type === 'input_recovery')).toHaveLength(1);
    expect(events.find((event) => event.type === 'input_recovery')).toMatchObject({
      reason: 'three_unconfirmed_card_inputs',
      learningEligible: false,
    });
    expect(types.at(-1)).toBe('result');
    expect(outcome).toMatchObject({ actions: 3, confirmed: 0, learningEligible: false });
  });

  it('uses the hero ability only after a confirmed Ice Wizard deployment', { timeout: 30_000 }, async () => {
    const { fake, outcome, types, events } = await play({
      controllerVersion: 3,
      screens: {
        start: { hand: ['ice_wizard', 'furnace', 'poison', 'skeletons'], elixir: 7 },
        deployed: { hand: ['goblin_hut', 'furnace', 'poison', 'skeletons'], elixir: 4, ability: true },
        used: { hand: ['goblin_hut', 'furnace', 'poison', 'skeletons'], elixir: 2 },
      },
      decisions: [{ pick: 'ice_wizard' }, { pick: 'ability' }],
      afterPlay: { 1: 'deployed' },
      afterAbility: 'used',
      end: { inputs: 2, captures: 1 },
    });
    expect(fake.match.abilities).toBe(1);
    expect(fake.match.requests[0]!.candidates.some((action) => action.kind === 'ability')).toBe(false);
    expect(types).toEqual([
      'match_start',
      'prediction',
      'input_sent',
      'input_check',
      'prediction',
      'ability_sent',
      'ability_check',
      'result',
    ]);
    expect(events.find((event) => event.type === 'ability_check')).toMatchObject({
      confirmed: true,
      changed: true,
      handUnchanged: true,
      spent: 2,
      expectedCost: 2,
    });
    expect(outcome).toMatchObject({ actions: 2, confirmed: 2, abilityActions: 1, abilityConfirmed: 1 });
  });
});

// 빠른 정책이 기사 카드만 강하게 고르도록 직접 만든 가중치다. 판단은 Qwen 없이 이 프로세스에서 한다.
function knightPolicy() {
  const zeros = (size: number) => new Float64Array(size);
  const weights: FastWeights = {
    'action.bias': zeros(FAST_POLICY.attention),
    'action.weight': zeros(FAST_POLICY.attention * ACTION_SIZE),
    'encoder.bias': zeros(FAST_POLICY.hidden),
    'encoder.weight': zeros(FAST_POLICY.hidden * STATE_SIZE),
    'query.bias': zeros(FAST_POLICY.attention),
    'query.weight': zeros(FAST_POLICY.attention * FAST_POLICY.hidden),
    'value.bias': zeros(1),
    'value.weight': zeros(FAST_POLICY.hidden),
  };
  weights['query.bias'][0] = 1;
  weights['action.weight'][FAST_POLICY.cards.indexOf('knight')] = 10;
  return new FastPolicy(weights, 7);
}

describe('the fast policy controller', () => {
  it('decides locally within the deadline and confirms its card input', { timeout: 30_000 }, async () => {
    const { fake, outcome, types, events } = await play(
      {
        controllerVersion: 3,
        screens: {
          start: { hand: START, elixir: 7 },
          after: { hand: ['goblin_hut', 'furnace', 'poison', 'skeletons'], elixir: 4 },
        },
        decisions: [],
        afterPlay: { 1: 'after' },
        end: { inputs: 1, captures: 1 },
      },
      fastController(knightPolicy()),
    );
    expect(fake.match.requests).toEqual([]);
    expect(types).toEqual(['match_start', 'prediction', 'input_sent', 'input_check', 'result']);
    expect(events[0]).toMatchObject({ controllerVersion: 4 });
    const prediction = events[1]!;
    expect(prediction.elapsedMs).toBeLessThan(100);
    expect(prediction.behavior).toMatchObject({ policy: 'fast', version: 7 });
    expect(events[2]!.action).toMatchObject({ card: 'knight' });
    expect(events[3]).toMatchObject({ confirmed: true, spent: 3 });
    expect(outcome).toMatchObject({ result: 'loss', actions: 1, confirmed: 1, learningEligible: true });
  });
});
