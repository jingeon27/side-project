import type { CardId } from '../../shared/config.ts';
import type { OpponentObservation } from '../learning/opponent-data.ts';
import type { UnitDetection, UnitScan } from './vision-client.ts';

export type VisualFrame = { path: string; capturedAt: number };
type Track = {
  id: number;
  kind: 'unit' | 'effect';
  card: CardId | null;
  x: number;
  y: number;
  birthY: number;
  first: VisualFrame;
  before: VisualFrame;
  lastAt: number;
  confirmations: number;
  confidence: number;
  suppressed: boolean;
  emitted: boolean;
};

export class OpponentTracker {
  readonly tracks: Track[] = [];
  readonly history: VisualFrame[] = [];
  readonly recent = new Map<string, number>();
  readonly state = { previous: null as VisualFrame | null, nextId: 1, accepted: 0, rejected: 0 };

  update(frame: VisualFrame, scan: UnitScan): OpponentObservation[] {
    const previous = this.state.previous;
    const reset = !previous || frame.capturedAt - previous.capturedAt > 3500;
    if (reset)
      this.tracks.forEach((track) => {
        track.suppressed = true;
      });
    const matched = new Set<number>();
    const events: OpponentObservation[] = [];
    for (const marker of scan.markers) {
      const kind = marker.kind ?? 'unit';
      if (
        kind === 'unit' &&
        scan.spawnedUnits?.some(
          (unit) =>
            unit.side === 'red' &&
            unit.confidence >= 0.85 &&
            Math.hypot((unit.marker_x ?? unit.x) - marker.x, (unit.marker_y ?? unit.y) - marker.y) < 16,
        )
      )
        continue;
      const detection = scan.entities
        .filter((entity) => ['graveyard', 'poison'].includes(entity.card) === (kind === 'effect'))
        .filter(
          (entity) => Math.hypot((entity.marker_x ?? entity.x) - marker.x, entity.marker_y - marker.y) < 16,
        )
        .toSorted((first, second) => second.confidence - first.confidence)[0];
      const existing = this.tracks
        .filter((track) => track.kind === kind)
        .filter((track) => kind !== 'effect' || !track.card || track.card === detection?.card)
        .filter((track) => !matched.has(track.id) && frame.capturedAt - track.lastAt < 4000)
        .filter(
          (track) =>
            Math.hypot(track.x - marker.x, track.y - marker.y) <=
            Math.max(20, ((frame.capturedAt - track.lastAt) / 1000) * 55),
        )
        .toSorted(
          (first, second) =>
            Math.hypot(first.x - marker.x, first.y - marker.y) -
            Math.hypot(second.x - marker.x, second.y - marker.y),
        )[0];
      const track = existing ?? {
        id: this.state.nextId++,
        kind,
        card: detection && detection.confidence >= 0.92 ? detection.card : null,
        x: marker.x,
        y: marker.y,
        birthY: marker.y,
        first: frame,
        before:
          this.history.findLast((entry) => entry.capturedAt <= frame.capturedAt - 2000) ??
          this.history[0] ??
          previous ??
          frame,
        lastAt: frame.capturedAt,
        confirmations: 0,
        confidence: 1,
        suppressed: reset,
        emitted: false,
      };
      if (!existing) this.tracks.push(track);
      matched.add(track.id);
      Object.assign(track, { x: marker.x, y: marker.y, lastAt: frame.capturedAt });
      if (!detection || detection.confidence < 0.92 || (track.card && track.card !== detection.card)) {
        if (detection && detection.confidence >= 0.92 && track.card && track.card !== detection.card)
          track.suppressed = true;
        track.confirmations = 0;
        continue;
      }
      track.card = detection.card;
      track.confirmations++;
      track.confidence = Math.min(track.confidence, detection.confidence);
      const event = this.confirm(track, frame, detection);
      if (event) events.push(event);
    }
    // Bound old tracks while retaining enough history to survive brief occlusion.
    this.tracks.splice(
      0,
      this.tracks.length,
      ...this.tracks.filter((track) => frame.capturedAt - track.lastAt < 12_000),
    );
    this.state.previous = frame;
    this.history.push(frame);
    this.history.splice(
      0,
      this.history.length,
      ...this.history.filter((entry) => frame.capturedAt - entry.capturedAt < 10_000),
    );
    return events;
  }

  private confirm(track: Track, frame: VisualFrame, detection: UnitDetection): OpponentObservation | null {
    if (
      track.suppressed ||
      track.emitted ||
      track.confirmations < 2 ||
      frame.capturedAt - track.first.capturedAt < 250
    )
      return null;
    if (frame.capturedAt - track.before.capturedAt > 10_000) {
      track.suppressed = true;
      return null;
    }
    // Troops crossing the river are existing plays. A red Barbarian is an
    // exception in this fixed deck: Barrel is its only possible card source.
    if (
      track.first.capturedAt === track.before.capturedAt ||
      (track.birthY > 245 &&
        !['graveyard', 'poison'].includes(detection.card) &&
        !(detection.card === 'barbarian_barrel' && track.birthY < 360))
    ) {
      track.suppressed = true;
      this.state.rejected++;
      return null;
    }
    const lane = detection.x < 158 ? 'left' : detection.x > 210 ? 'right' : 'center';
    // Canonical unit intents have left/right candidates; central buildings are supported.
    if (lane === 'center' && !['goblin_hut', 'graveyard', 'poison'].includes(detection.card)) return null;
    const key = `${detection.card}:${lane}`;
    if (frame.capturedAt - (this.recent.get(key) ?? 0) < 8000) {
      track.suppressed = true;
      return null;
    }
    this.recent.set(key, frame.capturedAt);
    track.emitted = true;
    this.state.accepted++;
    return {
      id: `spawn-${track.id}-${detection.card}-${lane}`,
      before: { image: track.before.path, capturedAt: track.before.capturedAt },
      after: { image: frame.path, capturedAt: frame.capturedAt },
      card: detection.card,
      lane,
      evidence: ['graveyard', 'poison'].includes(detection.card)
        ? 'spell_effect_visible'
        : 'new_unit_visible',
      confidence: track.confidence,
      verifiedActor: true,
      absentBefore: true,
      context: `Automatic red-marker track; ${track.confirmations} consistent crop classifications; ${detection.label}. Exact spawn coordinate, hand and elixir remain unknown.`,
      grounding: { x: detection.x, y: detection.y, box: detection.box },
    };
  }
}
