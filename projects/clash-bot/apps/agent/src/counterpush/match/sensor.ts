import { BattleMemory, type BattleSituation } from '../../core/battle/battle-state.ts';
import { FieldDynamics } from '../../core/battle/field-dynamics.ts';
import type { OpponentObservation, UnitScan } from '../../core/battle/observation.ts';
import type { SpawnPatterns } from '../../core/battle/spawn-patterns.ts';
import { COUNTERPUSH_DECK, COUNTERPUSH_EVOLUTIONS } from '../../core/deck.ts';
import type { Profile } from '../../core/profile.ts';
import { atomicWrite } from '../../shared/assets.ts';
import type { CounterpushBrowser } from '../browser/browser.ts';
import { counterpushBarReading, counterpushElixir } from '../perception/elixir.ts';
import { crop, fingerprint, loadHandCards, readHand, type Template } from '../perception/hand.ts';
import { HeroAbilityButton } from '../perception/hero-ability.ts';
import { OpponentTracker } from '../perception/tracker.ts';
import type { CounterpushVisionClient } from '../perception/vision-client.ts';
import type { FreshBattle } from './placement-check.ts';
import type { MatchRecorder } from './recorder.ts';
import type { MatchState } from './state.ts';

export type OwnFrame = {
  image: Buffer;
  capturedAt: number;
  path: string;
  state: FreshBattle;
  cards: Array<Profile['deck'][number] | null>;
  elixirConfidence: number;
  scan: UnitScan;
  situation: BattleSituation;
  perceptionMs: number;
  graveyardPresence: [number, number];
};

type SensorOptions = {
  browser: CounterpushBrowser;
  vision: CounterpushVisionClient;
  profile: Profile;
  recorder: MatchRecorder;
  state: MatchState;
  fastCapture: boolean;
  signal: AbortSignal;
  patterns?: SpawnPatterns;
  report: (status: Record<string, unknown>) => Promise<void>;
};

// 화면 한 장을 읽어 내 손패·엘릭서·능력, 필드, 상대 행동을 core 상태로 쌓는다. 경기 한 판 동안 하나다.
export class MatchSensor {
  readonly memory = new BattleMemory([...COUNTERPUSH_DECK], COUNTERPUSH_EVOLUTIONS);
  readonly tracker = new OpponentTracker();
  readonly observations: OpponentObservation[] = [];
  readonly dynamics: FieldDynamics;
  readonly abilityButton: HeroAbilityButton;
  private readonly options: SensorOptions;
  private readonly handCards: Template[];
  private readonly situations = new Map<string, BattleSituation>();

  private constructor(options: SensorOptions, handCards: Template[], abilityButton: HeroAbilityButton) {
    this.options = options;
    this.handCards = handCards;
    this.abilityButton = abilityButton;
    this.dynamics = new FieldDynamics(options.recorder.directory, options.patterns);
  }

  static async open(options: SensorOptions) {
    const handCards = await loadHandCards(options.profile);
    return new MatchSensor(options, handCards, await HeroAbilityButton.load());
  }

  private async readOwn() {
    const { browser, profile, recorder, state } = this.options;
    const started = performance.now();
    this.options.signal.throwIfAborted();
    const screenshot = await browser.capture(this.options.fastCapture);
    const path = recorder.framePath(++state.frames);
    await atomicWrite(path, screenshot.image);
    const [cards, bar, ability] = await Promise.all([
      readHand(screenshot.image, profile, this.handCards),
      counterpushBarReading(screenshot.image, profile),
      this.abilityButton.read(screenshot.image, screenshot.capturedAt),
    ]);
    const elixir = counterpushElixir(bar, profile);
    const fresh = {
      battle: (await browser.phase()) === 'battle',
      elixir: elixir.value,
      capturedAt: screenshot.capturedAt,
      hand: await Promise.all(
        profile.hand.map(async (rectangle) => fingerprint(await crop(screenshot.image, rectangle))),
      ),
    };
    return { started, screenshot, path, bar, ability, elixir, fresh, cards };
  }

  async capture(): Promise<OwnFrame> {
    const { vision, recorder, state } = this.options;
    const { started, screenshot, path, bar, ability, elixir, fresh, cards } = await this.readOwn();
    const scan = await vision.scan(path);
    const field = this.dynamics.observe(scan, screenshot.capturedAt);
    await recorder.vision({
      image: path,
      capturedAt: screenshot.capturedAt,
      scan,
      hand: cards,
      elixir: elixir.value,
      elixirAmount: elixir.amount,
      rawElixir: bar.elixir,
      elixirConfidence: bar.elixirConfidence,
    });
    const situation = this.memory.observe({
      at: screenshot.capturedAt,
      amount: elixir.amount,
      hand: cards,
      inputPending: state.inputPending,
      elixirReliable: bar.elixirConfidence >= 0.9,
      elixirRange: elixir.range,
      allies: field.allies,
      enemies: field.enemies,
      effects: field.effects,
      spawners: field.spawners,
      ability,
    });
    situation.own.elixir =
      !state.inputPending && bar.elixirConfidence >= 0.9 ? elixir.range : { min: 0, max: 10 };
    if (bar.elixirConfidence < 0.9) situation.opponent.elixir = { min: 0, max: 10 };
    this.situations.set(path, situation);
    for (const [key, value] of this.situations)
      if (screenshot.capturedAt - value.at > 12_000) this.situations.delete(key);
    if (fresh.battle) {
      if (!state.firstBattleAt) state.firstBattleAt = screenshot.capturedAt;
      if (
        state.actions === 0 &&
        screenshot.capturedAt - state.firstBattleAt > 15_000 &&
        fresh.elixir < 2 &&
        cards.filter(Boolean).length >= 2
      )
        throw new Error('시작 후 카드 지출 없이 엘릭서가 계속 0~1로 읽혀 인식을 재확인해야 합니다.');
      state.seenBattle = true;
      await this.trackOpponent(path, screenshot.capturedAt, scan);
      // These plays are known by this frame's decision, while earlier stored
      // snapshots stay unchanged for training without future information.
      const ledger = this.memory.elixir.snapshot(screenshot.capturedAt);
      Object.assign(situation.opponent, {
        elixir: state.inputPending || bar.elixirConfidence < 0.9 ? { min: 0, max: 10 } : ledger.opponent,
        cycle: this.memory.opponentCycle.snapshot(),
        evolutions: this.memory.opponentEvolutions.snapshot(),
        seenSpent: ledger.opponentSeenSpent,
      });
    }
    await recorder.state({
      version: 1,
      image: path,
      capturedAt: screenshot.capturedAt,
      inputPending: state.inputPending,
      situation,
    });
    if (state.frames % 5 === 0)
      await this.options.report({
        phase: 'playing',
        episode: recorder.directory,
        frames: state.frames,
        actions: state.actions,
        confirmed: state.confirmed,
        abilityActions: state.abilityActions,
        abilityConfirmed: state.abilityConfirmed,
        ability: situation.own.ability,
        opponentActions: this.observations.length,
        visionMs: scan.elapsed_ms,
        spawnedUnitsVisible: scan.spawnedUnits?.length ?? 0,
        learnedSpawnCasts: this.dynamics.patterns.casts.length,
        graveyardPhases: field.effects
          .filter((effect) => effect.card === 'graveyard')
          .map((effect) => ({
            x: effect.x,
            y: effect.y,
            visibleAgeMs: effect.visibleAgeMs,
            onsetCertain: effect.onsetCertain,
            predictedAppearances: effect.predictions?.length ?? 0,
          })),
      });
    return {
      ...screenshot,
      path,
      state: fresh,
      cards,
      elixirConfidence: bar.elixirConfidence,
      scan,
      situation,
      perceptionMs: Math.round(performance.now() - started),
      graveyardPresence: scan.graveyardPresence ?? [0, 0],
    };
  }

  // Recheck input legality and new Graveyard pixels, without pretending a
  // repeated unit classification is a newly observed field.
  async recheck(before: OwnFrame): Promise<OwnFrame> {
    const { started, screenshot, path, bar, ability, elixir, fresh, cards } = await this.readOwn();
    const guard = await this.options.vision.guard(path);
    return {
      ...screenshot,
      path,
      state: fresh,
      cards,
      elixirConfidence: bar.elixirConfidence,
      scan: before.scan,
      perceptionMs: Math.round(performance.now() - started),
      graveyardPresence: guard.graveyardPresence,
      situation: {
        ...before.situation,
        own: { ...before.situation.own, hand: cards, elixir: elixir.range, ability },
      },
    };
  }

  private async trackOpponent(path: string, capturedAt: number, scan: UnitScan) {
    const { vision, recorder } = this.options;
    for (const event of this.tracker.update({ path, capturedAt }, scan)) {
      const absence = event.grounding
        ? await vision.absent(
            event.before.image,
            event.card,
            event.grounding.box,
            Number(event.after.capturedAt) - Number(event.before.capturedAt),
          )
        : null;
      if (!absence?.absent) {
        await recorder.event({
          type: 'opponent_rejected',
          observation: event,
          reason: 'prior_presence_or_ambiguity',
          absence,
        });
        continue;
      }
      const beforeSituation = this.situations.get(event.before.image);
      if (!beforeSituation) {
        await recorder.event({
          type: 'opponent_rejected',
          reason: 'missing_before_state',
          observation: event,
        });
        continue;
      }
      const enriched = { ...event, situation: beforeSituation };
      this.observations.push(enriched);
      this.memory.opponentPlay(event.card, Number(event.before.capturedAt), capturedAt);
      await recorder.event({ type: 'opponent_action', observation: enriched, absence });
    }
  }
}
