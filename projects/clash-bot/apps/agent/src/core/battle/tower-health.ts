export type TowerHpReading = { tower: 'left' | 'right'; hp: number | null; confidence: number };
export type TowerHpSnapshot = {
  tower: 'left' | 'right';
  hp: number | null;
  confirmedAt: number | null;
  observedDamage: number;
};

// Text confidence is not a calibrated HP probability. Require independent frames,
// and never turn an obscured/destroyed tower or a missing label into zero/full HP.
export class TowerHealthTracker {
  private readonly tracks = new Map<
    TowerHpReading['tower'],
    {
      candidate: number | null;
      at: number;
      repeats: number;
      lastHp: number | null;
      confirmedAt: number | null;
      damage: number;
    }
  >();

  observe(readings: TowerHpReading[], at: number): TowerHpSnapshot[] {
    return (['left', 'right'] as const).map((tower) => {
      const matches = readings.filter((reading) => reading.tower === tower);
      const reading = matches.length === 1 ? matches[0] : undefined;
      const hp =
        reading &&
        reading.confidence >= 0.8 &&
        reading.hp !== null &&
        Number.isInteger(reading.hp) &&
        reading.hp > 0 &&
        reading.hp <= 20_000
          ? reading.hp
          : null;
      const old = this.tracks.get(tower);
      const repeats =
        hp !== null && old?.candidate === hp && at > old.at && at - old.at <= 1500 ? old.repeats + 1 : 1;
      // An upward jump may be OCR confusion. This experiment has no separate
      // evidence for healing, so an increase remains unknown instead of damage.
      const confirmed =
        hp !== null &&
        repeats >= 2 &&
        (old?.lastHp === null || old?.lastHp === undefined || hp <= old.lastHp);
      const damage =
        (old?.damage ?? 0) +
        (confirmed && old?.lastHp !== null && old?.lastHp !== undefined ? Math.max(0, old.lastHp - hp) : 0);
      const track = {
        candidate: hp,
        at,
        repeats,
        lastHp: confirmed ? hp : (old?.lastHp ?? null),
        confirmedAt: confirmed ? at : (old?.confirmedAt ?? null),
        damage,
      };
      this.tracks.set(tower, track);
      return { tower, hp: confirmed ? hp : null, confirmedAt: track.confirmedAt, observedDamage: damage };
    });
  }
}
