import { type CardId } from '../../shared/config.ts';
import { CARD_MECHANICS, type UnitKind } from '../../shared/game-knowledge.ts';
import { type UnitScan } from '../perception/vision-client.ts';
import { type FieldEffect, type FieldUnit } from './battle-state.ts';
import { SpawnPatterns, type SpawnCast } from './spawn-patterns.ts';

type UnitTrack = {
  id: string;
  key: string;
  side: 'red' | 'blue';
  card: CardId | null;
  kind: UnitKind | undefined;
  x: number;
  y: number;
  at: number;
  vx: number;
  vy: number;
};
type EffectTrack = {
  id: string;
  card: 'graveyard' | 'poison';
  side: 'red' | 'blue';
  x: number;
  y: number;
  firstAt: number;
  lastAt: number;
  onsetCertain: boolean;
  samples: SpawnCast['samples'];
  seenSkeletons: Set<string>;
};

export class FieldDynamics {
  readonly episode: string;
  readonly patterns: SpawnPatterns;
  readonly units: UnitTrack[] = [];
  readonly effects: EffectTrack[] = [];
  readonly parents = new Map<string, { children: number; lastAt: number | null }>();
  readonly origins = new Map<string, string>();
  readonly state = { next: 1, at: 0 };
  constructor(episode: string, patterns = new SpawnPatterns()) {
    this.episode = episode.split('/').at(-1) ?? episode;
    this.patterns = patterns;
  }

  observe(scan: UnitScan, at: number) {
    const gap = this.state.at ? at - this.state.at : Infinity;
    if (gap > 1500)
      this.effects.forEach((effect) => {
        effect.onsetCertain = false;
      });
    const matched = new Set<string>();
    const raw = [
      ...scan.allies.map((unit) => ({
        ...unit,
        side: 'blue' as const,
        sourceCard: undefined as CardId | undefined,
      })),
      ...scan.entities
        .filter((unit) => !['graveyard', 'poison'].includes(unit.card))
        .map((unit) => ({ ...unit, side: 'red' as const, sourceCard: undefined as CardId | undefined })),
      ...(scan.spawnedUnits ?? []).map((unit) => ({ ...unit, card: null, variant: 'base' as const })),
    ];
    const bodies = raw.map((unit) => {
      const kind =
        unit.kind ??
        (unit.card === 'goblin_hut' ? 'goblin_hut' : unit.card ? CARD_MECHANICS[unit.card]?.body : undefined);
      const key = `${unit.side}:${kind ?? unit.card ?? 'unknown'}`;
      const existing = this.units
        .filter((track) => track.key === key && !matched.has(track.id) && at - track.at <= 1500)
        .filter(
          (track) =>
            Math.hypot(track.x - unit.x, track.y - unit.y) <= Math.max(25, ((at - track.at) / 1000) * 90),
        )
        .toSorted(
          (first, second) =>
            Math.hypot(first.x - unit.x, first.y - unit.y) - Math.hypot(second.x - unit.x, second.y - unit.y),
        )[0];
      const track = existing ?? {
        id: `u${this.state.next++}`,
        key,
        side: unit.side,
        card: unit.card,
        kind,
        x: unit.x,
        y: unit.y,
        at,
        vx: 0,
        vy: 0,
      };
      if (!existing) this.units.push(track);
      const seconds = (at - track.at) / 1000;
      const velocity =
        kind !== 'goblin_hut' && existing && seconds > 0.05
          ? {
              vx: 0.7 * track.vx + (0.3 * (unit.x - track.x)) / seconds,
              vy: 0.7 * track.vy + (0.3 * (unit.y - track.y)) / seconds,
            }
          : { vx: 0, vy: 0 };
      Object.assign(track, { x: unit.x, y: unit.y, at, ...velocity });
      matched.add(track.id);
      const body: FieldUnit & { side: 'red' | 'blue'; born: boolean } = {
        card: unit.confidence >= 0.85 ? unit.card : null,
        kind: kind ?? undefined,
        variant: unit.variant ?? 'unknown',
        confidence: unit.confidence,
        x: unit.x,
        y: unit.y,
        trackId: track.id,
        side: unit.side,
        born: !existing,
        sourceCard: unit.confidence >= 0.8 ? unit.sourceCard : undefined,
        possibleParent: this.origins.get(track.id) ?? null,
        velocity: {
          xPerSecond: Math.round(velocity.vx * 10) / 10,
          yPerSecond: Math.round(velocity.vy * 10) / 10,
          speedPixelsPerSecond: Math.round(Math.hypot(velocity.vx, velocity.vy) * 10) / 10,
        },
      };
      return body;
    });
    for (const child of bodies.filter(
      (body) => body.sourceCard && body.confidence >= 0.85 && !this.origins.has(body.trackId!),
    )) {
      const parents = bodies
        .filter(
          (body) => body.side === child.side && body.card === child.sourceCard && body.confidence >= 0.85,
        )
        .map((body) => ({ body, distance: Math.hypot(body.x - child.x, body.y - child.y) }))
        .filter((candidate) => candidate.distance < 90)
        .toSorted((first, second) => first.distance - second.distance);
      if (!parents[0] || (parents[1] && parents[1].distance - parents[0].distance < 20)) continue;
      child.possibleParent = parents[0].body.trackId!;
      this.origins.set(child.trackId!, child.possibleParent);
      const counter = this.parents.get(child.possibleParent) ?? { children: 0, lastAt: null };
      counter.children++;
      counter.lastAt = at;
      this.parents.set(child.possibleParent, counter);
    }
    const fieldEffects: FieldEffect[] = (scan.effects ?? []).map((effect) => {
      const existing = this.effects.find(
        (track) =>
          track.card === effect.card &&
          track.side === effect.side &&
          at - track.lastAt <= 2000 &&
          Math.hypot(track.x - effect.x, track.y - effect.y) < 55,
      );
      const track = existing ?? {
        id: `${this.episode}:e${this.state.next++}`,
        card: effect.card,
        side: effect.side,
        x: effect.x,
        y: effect.y,
        firstAt: at,
        lastAt: at,
        onsetCertain: gap <= 1200,
        samples: [],
        seenSkeletons: new Set<string>(),
      };
      if (!existing) this.effects.push(track);
      Object.assign(track, { x: effect.x, y: effect.y, lastAt: at });
      if (at - track.firstAt > 12_000) track.onsetCertain = false; // overlapping/ambiguous casts
      if (effect.card === 'graveyard' && track.onsetCertain) {
        for (const skeleton of bodies.filter(
          (body) =>
            !track.seenSkeletons.has(body.trackId!) &&
            body.side === effect.side &&
            body.kind === 'skeleton' &&
            body.confidence >= 0.85 &&
            Math.hypot(body.x - effect.x, body.y - effect.y) < effect.radius * 1.3,
        )) {
          track.seenSkeletons.add(skeleton.trackId!);
          track.samples.push({
            afterMs: at - track.firstAt,
            dx: (skeleton.x - effect.x) / effect.radius,
            dy: (skeleton.y - effect.y) / effect.radius,
            confidence: skeleton.confidence,
          });
        }
      }
      const snapshot = {
        ...effect,
        visibleAgeMs: at - track.firstAt,
        onsetCertain: track.onsetCertain,
        source: 'visual' as const,
      };
      return {
        ...snapshot,
        predictions: track.onsetCertain && effect.card === 'graveyard' ? this.patterns.predict(snapshot) : [],
      };
    });
    this.finishOldEffects(at, false);
    this.units.splice(0, this.units.length, ...this.units.filter((track) => at - track.at < 2000));
    this.state.at = at;
    return {
      allies: bodies.filter((body) => body.side === 'blue').slice(0, 18),
      enemies: bodies.filter((body) => body.side === 'red').slice(0, 24),
      effects: fieldEffects,
      spawners: bodies
        .filter((body) => body.card === 'furnace' || body.card === 'goblin_hut')
        .map((body) => ({
          trackId: body.trackId!,
          card: body.card!,
          side: body.side,
          observedChildren: this.parents.get(body.trackId!)?.children ?? 0,
          lastChildSeenAgoMs:
            this.parents.get(body.trackId!)?.lastAt == null
              ? null
              : at - this.parents.get(body.trackId!)!.lastAt!,
        })),
    };
  }
  finishOldEffects(at: number, all: boolean) {
    for (const track of this.effects.filter((effect) => all || at - effect.lastAt > 2000)) {
      if (track.card === 'graveyard' && track.onsetCertain)
        this.patterns.add({
          id: track.id,
          side: track.side,
          observedMs: track.lastAt - track.firstAt,
          samples: track.samples,
        });
    }
    this.effects.splice(
      0,
      this.effects.length,
      ...this.effects.filter((effect) => !all && at - effect.lastAt <= 2000),
    );
  }
}
