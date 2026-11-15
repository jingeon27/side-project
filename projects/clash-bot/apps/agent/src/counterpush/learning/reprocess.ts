import { readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import { atomicWrite } from '../../assets.ts';
import { type CardId, type Point, type Profile } from '../../config.ts';
import { type OpponentObservation } from '../../opponent-data.ts';
import { analyze, loadTemplates } from '../../vision.ts';
import { BattleMemory, type BattleSituation } from '../domain/battle-state.ts';
import { FieldDynamics } from '../domain/field-dynamics.ts';
import { counterpushBarReading, counterpushElixir } from '../perception/elixir.ts';
import { HeroAbilityButton } from '../perception/hero-ability.ts';
import { OpponentTracker } from '../perception/tracker.ts';
import { type CounterpushVisionClient } from '../perception/vision-client.ts';
import { COUNTERPUSH_DECK, COUNTERPUSH_EVOLUTIONS } from '../runtime/browser.ts';

type RecordedEvent = {
  type: string;
  at: number;
  frame: number;
  confirmed?: boolean;
  changed?: boolean;
  spent?: number;
  sentAt?: number;
  action?: { card: CardId; target: Point; abilityInstance?: number };
};

// Reuses local recordings, never the site's daily review feature. This produces
// new, auditable demonstrations only; old on-policy episodes are not retrained.
export async function reprocessEpisode(
  vision: CounterpushVisionClient,
  dataDir: string,
  directory: string,
  profile: Profile,
) {
  const root = resolve(dataDir, 'counterpush/runs');
  const location = relative(root, resolve(directory));
  if (!location || location.startsWith('../..') || resolve(root, location) !== resolve(directory))
    throw new Error('Counterpush 경기 기록 폴더가 필요합니다.');
  const summary = JSON.parse(await readFile(join(directory, 'summary.json'), 'utf8'));
  if (!summary.seenBattle || !['win', 'loss', 'draw'].includes(summary.result))
    throw new Error('결과가 확인된 완료 경기만 다시 인식합니다.');
  const frames = (await readFile(join(directory, 'vision.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { image: string; capturedAt: number });
  const events = (await readFile(join(directory, 'events.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RecordedEvent);
  const original = JSON.parse(await readFile(join(directory, 'observations.json'), 'utf8')) as {
    observations: OpponentObservation[];
  };
  const inputs = events
    .filter((event) => ['input_sent', 'ability_sent'].includes(event.type))
    .map((event) => ({
      ...event,
      check: events.find(
        (check) =>
          check.type === (event.type === 'ability_sent' ? 'ability_check' : 'input_check') &&
          check.frame === event.frame,
      ),
    }));
  const applied = new Set<number>();
  const tracker = new OpponentTracker();
  const memory = new BattleMemory([...COUNTERPUSH_DECK], COUNTERPUSH_EVOLUTIONS);
  const abilityButton = await HeroAbilityButton.load();
  const dynamics = new FieldDynamics(directory);
  const situations = new Map<string, BattleSituation>();
  const templates = await loadTemplates(dataDir, profile);
  const observations: OpponentObservation[] = [];
  const rejected: Array<{ id: string; reason: string }> = [];
  for (const frame of frames) {
    const image = await readFile(frame.image);
    const raw = {
      ...(await analyze(image, profile, templates, frame.capturedAt)),
      ...(await counterpushBarReading(image, profile)),
    };
    const cards = raw.hand.map((slot) => slot.card);
    const elixir = counterpushElixir(raw, profile);
    const scan = await vision.scan(frame.image);
    const field = dynamics.observe(scan, frame.capturedAt);
    for (const input of inputs.filter(
      (entry) => entry.check && entry.check.at <= frame.capturedAt && !applied.has(entry.frame),
    )) {
      applied.add(input.frame);
      const confirmed = input.check!.confirmed ?? (input.check!.changed && (input.check!.spent ?? 0) >= 1);
      if (confirmed && input.action) {
        if (input.type === 'ability_sent') {
          const instance = input.action.abilityInstance;
          if (instance) {
            memory.ownAbility(input.sentAt ?? input.at, instance);
            abilityButton.markUsed(instance);
          }
        } else {
          memory.ownPlay(input.action.card, input.sentAt ?? input.at, input.action.target, cards);
          if (input.action.card === 'ice_wizard') abilityButton.newDeployment();
        }
      } else if (input.type === 'input_sent') memory.ownEvolutions.uncertain();
    }
    const inputPending = inputs.some(
      (entry) =>
        (entry.sentAt ?? entry.at) <= frame.capturedAt && (!entry.check || frame.capturedAt < entry.check.at),
    );
    const situation = memory.observe({
      at: frame.capturedAt,
      amount: elixir.amount,
      hand: cards,
      elixirRange: elixir.range,
      elixirReliable: raw.elixirConfidence >= 0.9,
      inputPending,
      allies: field.allies,
      enemies: field.enemies,
      effects: field.effects,
      spawners: field.spawners,
      ability: await abilityButton.read(image, frame.capturedAt),
    });
    situations.set(frame.image, situation);
    for (const [key, value] of situations) if (frame.capturedAt - value.at > 12_000) situations.delete(key);
    for (const event of tracker.update({ path: frame.image, capturedAt: frame.capturedAt }, scan)) {
      const before = situations.get(event.before.image);
      const absence = event.grounding
        ? await vision.absent(
            event.before.image,
            event.card,
            event.grounding.box,
            Number(event.after.capturedAt) - Number(event.before.capturedAt),
          )
        : null;
      if (!before || !absence?.absent) {
        rejected.push({
          id: event.id,
          reason: !before ? 'missing_before_state' : 'prior_presence_or_ambiguity',
        });
        continue;
      }
      memory.opponentPlay(event.card, Number(event.before.capturedAt), frame.capturedAt);
      if (
        original.observations.some(
          (item) =>
            item.card === event.card &&
            Math.abs(Number(item.after.capturedAt) - Number(event.after.capturedAt)) < 10_000,
        )
      ) {
        rejected.push({ id: event.id, reason: 'already_observed_in_original' });
        continue;
      }
      observations.push({ ...event, situation: before });
    }
  }
  const selected = [...COUNTERPUSH_DECK].flatMap((card) =>
    observations
      .filter((item) => item.card === card)
      .toSorted((first, second) => second.confidence - first.confidence)
      .slice(0, 2),
  );
  const path = join(directory, 'reprocessed-observations.json');
  if (selected.length)
    await atomicWrite(
      path,
      JSON.stringify(
        {
          version: 1,
          source: 'counterpush_live_screen',
          actor: 'red_top',
          annotation: 'automatic_dino_tracking',
          deck: COUNTERPUSH_DECK,
          crop: { x: 0, y: 0, width: 368, height: 652 },
          observations: selected,
        },
        null,
        2,
      ) + '\n',
    );
  const report = {
    frames: frames.length,
    path: selected.length ? path : null,
    cards: Object.fromEntries(
      COUNTERPUSH_DECK.map((card) => [card, selected.filter((item) => item.card === card).length]),
    ),
    rejected,
    source: 'local_recordings_not_site_review',
    trained: false,
  };
  await atomicWrite(join(directory, 'reprocessing.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
