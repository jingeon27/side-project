import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import dayjs from 'dayjs';
import sharp from 'sharp';
import { afterEach, beforeEach } from 'vitest';

import type { UnitScan } from '../../core/battle/observation.ts';
import type { CardId } from '../../core/cards.ts';
import type { Point } from '../../core/geometry.ts';
import type { QwenAction } from '../../core/policy/actions.ts';
import { loadProfile, type Profile } from '../../core/profile.ts';
import type { LearningClient, LearningDecisionRequest } from '../../qwen/learning-client.ts';
import { parseBrowserResult, type BrowserPhase, type CounterpushBrowser } from '../browser/browser.ts';
import { loadHandReferences } from '../perception/hand-references.ts';
import type { CounterpushVisionClient } from '../perception/vision-client.ts';
import { controllerFor, type Controller } from './controllers.ts';
import { playCounterpushEpisode } from './episode.ts';

const PURPLE = { r: 170, g: 60, b: 210 };
const EMPTY_SCAN: UnitScan = { entities: [], markers: [], elapsed_ms: 5, allies: [] };
const ABILITY_PORTRAIT = { left: 317, top: 477, size: 30 };
export const START: CardId[] = ['knight', 'furnace', 'poison', 'skeletons'];

type Screen = { hand: CardId[]; elixir: number; ability?: boolean };

export async function battleScreen(profile: Profile, screen: Screen) {
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

export type Decision = {
  pick: 'wait' | 'ability' | CardId;
  elapsedMs?: number;
  show?: string;
  delayMs?: number;
};
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
      return { image: await screens[match.screen]!, capturedAt: dayjs().valueOf() };
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

export const readLines = async (path: string) =>
  (await readFile(path, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);

// 검사 파일마다 한 번 호출한다. 검사마다 임시 기록 폴더와 프로필을 준비하고 대본 경기를 가짜 자원으로 실행한다.
export function episodeHarness() {
  const fixture = {
    dataDir: '',
    profile: undefined as Profile | undefined,
    abort: new AbortController(),
    episodes: [] as Array<Promise<unknown>>,
  };
  beforeEach(async () => {
    fixture.abort = new AbortController();
    fixture.episodes = [];
    fixture.dataDir = await mkdtemp(join(tmpdir(), 'clash-episode-'));
    fixture.profile = await loadProfile(
      fileURLToPath(new URL('../../../../../profiles/counterpush.json', import.meta.url)),
    );
  });
  afterEach(async () => {
    // 시간 초과로 끝난 테스트의 경기가 마감까지 돌며 지운 기록 폴더에 다시 쓰지 않게 멈추고 기다린다.
    fixture.abort.abort();
    await Promise.allSettled(fixture.episodes);
    await rm(fixture.dataDir, { recursive: true, force: true });
  });

  async function play(scenario: Scenario, controller?: Controller) {
    const fake = scenarioMatch(fixture.profile!, scenario);
    const episode = playCounterpushEpisode({
      browser: fake.browser,
      controller: controller ?? (await controllerFor(fake.client)),
      vision: fake.vision,
      dataDir: fixture.dataDir,
      profile: fixture.profile!,
      signal: fixture.abort.signal,
      report: async () => {},
      persistPatterns: false,
    });
    fixture.episodes.push(episode);
    const outcome = await episode;
    const events = await readLines(join(outcome.directory, 'events.jsonl'));
    return { fake, outcome, events, types: events.map((event) => event.type) };
  }
  return { fixture, play };
}
