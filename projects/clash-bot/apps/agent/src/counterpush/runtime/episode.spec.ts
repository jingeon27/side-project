import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { QwenAction } from '../../game/actions.ts';
import type { LearningClient, LearningDecisionRequest } from '../../qwen/learning-client.ts';
import { loadProfile, type CardId, type Point, type Profile } from '../../shared/config.ts';
import { counterpushBarReading, counterpushElixir } from '../perception/elixir.ts';
import { loadHandReferences } from '../perception/hand-references.ts';
import type { CounterpushVisionClient, UnitScan } from '../perception/vision-client.ts';
import { parseBrowserResult, type BrowserPhase, type CounterpushBrowser } from './browser.ts';
import { playCounterpushEpisode } from './episode.ts';

const PURPLE = { r: 170, g: 60, b: 210 };
const EMPTY_SCAN: UnitScan = { entities: [], markers: [], elapsed_ms: 5, allies: [] };

async function battleScreen(profile: Profile, hand: CardId[], elixir: number) {
  const references = (await loadHandReferences()).references.filter((item) => item.state === 'normal');
  const art = (card: CardId) => references.find((item) => item.card === card)!.bytes;
  const fill = Math.min(profile.elixir.width, Math.ceil(elixir * 25.6 - 18) + 1);
  const slots = await Promise.all(
    hand.map(async (card, index) => ({
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
  return sharp({ create: { width: 368, height: 652, channels: 3, background: '#20262c' } })
    .composite([...slots, { input: bar, left: profile.elixir.x, top: profile.elixir.y }])
    .png()
    .toBuffer();
}

type Reply = 'wait' | 'slow' | 'knight';

// 브라우저·인식 워커·Qwen만 가짜로 두고 실제 손패·엘릭서 판독과 기록을 그대로 실행한다.
function fakeMatch(profile: Profile, controllerVersion: 1 | 3, replies: Reply[]) {
  const screens: Record<'before' | 'after', Promise<Buffer>> = {
    before: battleScreen(profile, ['knight', 'furnace', 'poison', 'skeletons'], 7),
    after: battleScreen(profile, ['goblin_hut', 'furnace', 'poison', 'skeletons'], 4),
  };
  const match = {
    phase: 'setup' as BrowserPhase,
    screen: 'before' as 'before' | 'after',
    capturesUntilResult: Infinity,
    plays: [] as Array<{ slot: number; target: Point }>,
    requests: [] as LearningDecisionRequest[],
  };
  const browser = {
    phase: async () => match.phase,
    startMatch: async () => {
      match.phase = 'battle';
    },
    capture: async () => {
      if (--match.capturesUntilResult <= 0) match.phase = 'result';
      return { image: await screens[match.screen], capturedAt: Date.now() };
    },
    play: async (_profile: Profile, slot: number, target: Point) => {
      match.plays.push({ slot, target });
      match.screen = 'after';
      match.capturesUntilResult = 1;
      return true;
    },
    result: async () =>
      match.phase === 'result' ? parseBrowserResult('Crowns: you 1, the opponent 3') : null,
    activateAbility: async () => false,
    screenshot: async (path: string) => writeFile(path, 'result'),
  } as unknown as CounterpushBrowser;
  const vision = {
    scan: async () => EMPTY_SCAN,
    absent: async () => ({ absent: false }),
    guard: async () => ({ graveyardPresence: [0, 0] }),
  } as unknown as CounterpushVisionClient;
  const pick = (candidates: QwenAction[], reply: Reply) =>
    reply === 'knight'
      ? candidates.find((action) => action.card === 'knight' && action.kind !== 'ability')!
      : candidates.find((action) => action.id === 0)!;
  const client = {
    status: async () => ({ controller_version: controllerVersion, version: 7 }),
    choose: async (request: LearningDecisionRequest) => {
      match.requests.push(request);
      const reply = replies[match.requests.length - 1] ?? 'wait';
      return {
        text: JSON.stringify({ choice: pick(request.candidates, reply).id }),
        elapsedMs: reply === 'slow' ? 1500 : 120,
        peakGb: 16,
        behavior: { version: 7, controller_version: controllerVersion },
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

describe.each([
  { controllerVersion: 3 as const, replies: ['wait', 'slow', 'knight'] as Reply[] },
  { controllerVersion: 1 as const, replies: ['wait', 'knight'] as Reply[] },
])('a recorded Counterpush match with controller $controllerVersion', ({ controllerVersion, replies }) => {
  const state = { dataDir: '', profile: undefined as Profile | undefined };
  beforeEach(async () => {
    state.dataDir = await mkdtemp(join(tmpdir(), 'clash-episode-'));
    state.profile = await loadProfile(
      fileURLToPath(new URL('../../../../../profiles/counterpush.json', import.meta.url)),
    );
  });
  afterEach(async () => {
    await rm(state.dataDir, { recursive: true, force: true });
  });

  it('reads the synthetic screens like a real battle', async () => {
    const profile = state.profile!;
    const before = await battleScreen(profile, ['knight', 'furnace', 'poison', 'skeletons'], 7);
    const reading = await counterpushBarReading(before, profile);
    expect(counterpushElixir(reading, profile).value).toBe(7);
    expect(reading.elixirConfidence).toBeGreaterThanOrEqual(0.9);
  });

  it('records decisions, a confirmed card input and the verified result', async () => {
    const profile = state.profile!;
    const fake = fakeMatch(profile, controllerVersion, replies);
    const statuses: Array<Record<string, unknown>> = [];
    const outcome = await playCounterpushEpisode({
      browser: fake.browser,
      client: fake.client,
      vision: fake.vision,
      dataDir: state.dataDir,
      profile,
      signal: new AbortController().signal,
      report: async (status) => {
        statuses.push(status);
      },
      persistPatterns: false,
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
    const events = await readLines(join(outcome.directory, 'events.jsonl'));
    const types = events.map((event) => event.type);
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
    const decisions = events.filter((event) => event.type === 'prediction');
    expect(decisions.map((event) => event.frame)).toEqual(decisions.map((_, index) => index + 1));
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
      decisions: replies.length,
    });
    const observations = JSON.parse(await readFile(join(outcome.directory, 'observations.json'), 'utf8'));
    expect(observations).toMatchObject({ version: 1, actor: 'red_top', observations: [] });
    const states = await readLines(join(outcome.directory, 'states.jsonl'));
    expect(states.length).toBeGreaterThanOrEqual(replies.length);
    expect(states.every((row) => row.version === 1 && typeof row.situation === 'object')).toBe(true);
    expect((await readLines(join(outcome.directory, 'vision.jsonl'))).length).toBe(states.length);
    const files = await readdir(outcome.directory);
    expect(files).toEqual(expect.arrayContaining(['0001.png', 'frames', 'result-page.png']));
    expect(statuses.length).toBeGreaterThanOrEqual(0);
  }, 30_000);
});
