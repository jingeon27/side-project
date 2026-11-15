import { describe, expect, it } from 'vitest';

import type { CardId } from '../config.ts';
import { parseBrowserResult } from './browser.ts';
import { OpponentTracker } from './tracker.ts';
import type { UnitScan } from './vision-client.ts';

const frame = (at: number) => ({ path: `/capture/${at}.png`, capturedAt: at });
const scan = (x = 95, y = 160, confidence = 0.97, card: CardId = 'furnace'): UnitScan => ({
  markers: [
    { x, y, bottom: y + 10, width: 10, kind: ['graveyard', 'poison'].includes(card) ? 'effect' : 'unit' },
  ],
  allies: [],
  elapsed_ms: 150,
  entities: [
    {
      card,
      confidence,
      label: card,
      x,
      y: y + 28,
      marker_y: y,
      box: [x - 15, y + 10, x + 15, y + 50],
      side: 'red',
    },
  ],
});
const empty: UnitScan = { markers: [], entities: [], allies: [], elapsed_ms: 100 };

describe('Counterpush opponent action tracking', () => {
  it('requires a new red marker and two consistent classifications, then suppresses movement duplicates', () => {
    const tracker = new OpponentTracker();
    expect(tracker.update(frame(10000), empty)).toEqual([]);
    expect(tracker.update(frame(10500), scan())).toEqual([]);
    const events = tracker.update(frame(11000), scan(97, 165));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      card: 'furnace',
      lane: 'left',
      before: { capturedAt: 10000 },
      after: { capturedAt: 11000 },
      verifiedActor: true,
      absentBefore: true,
    });
    expect(tracker.update(frame(11500), scan(99, 170))).toEqual([]);
    expect(tracker.update(frame(12000), scan(100, 175))).toEqual([]);
  });
  it('does not call a unit already on the board a newly played card', () => {
    const tracker = new OpponentTracker();
    expect(tracker.update(frame(10000), scan())).toEqual([]);
    expect(tracker.update(frame(10500), scan(97, 170))).toEqual([]);
    expect(tracker.update(frame(11000), scan(99, 180))).toEqual([]);
  });
  it('rejects uncertain identity, identity changes and observation gaps', () => {
    const tracker = new OpponentTracker();
    tracker.update(frame(10000), empty);
    tracker.update(frame(10500), scan(95, 160, 0.99));
    expect(tracker.update(frame(11000), scan(95, 160, 0.7))).toEqual([]);
    expect(tracker.update(frame(11500), scan(95, 160, 0.99, 'knight'))).toEqual([]);
    expect(tracker.update(frame(12000), scan(95, 160, 0.99, 'knight'))).toEqual([]);
    expect(tracker.update(frame(20000), scan(95, 160))).toEqual([]);
    expect(tracker.update(frame(20500), scan(95, 170))).toEqual([]);
  });
  it('does not learn a troop first seen attacking our side as a fresh deployment', () => {
    const tracker = new OpponentTracker();
    tracker.update(frame(10000), empty);
    tracker.update(frame(10500), scan(95, 330));
    expect(tracker.update(frame(11000), scan(95, 340))).toEqual([]);
  });
  it('can confirm a newly spawned support troop after it walks toward the bridge without treating early uncertainty as its identity', () => {
    const tracker = new OpponentTracker();
    tracker.update(frame(10000), empty);
    tracker.update(frame(10500), scan(95, 210, 0.7, 'knight'));
    tracker.update(frame(11000), scan(95, 235, 0.98, 'furnace'));
    expect(tracker.update(frame(11500), scan(95, 255, 0.98, 'furnace'))).toHaveLength(1);
  });
  it('tracks Poison separately from an existing Graveyard effect in the same area', () => {
    const tracker = new OpponentTracker();
    tracker.update(frame(10000), empty);
    tracker.update(frame(10500), scan(95, 400, 0.98, 'graveyard'));
    expect(tracker.update(frame(11000), scan(95, 400, 0.98, 'graveyard'))[0]?.card).toBe('graveyard');
    tracker.update(frame(11500), scan(95, 400, 0.98, 'poison'));
    expect(tracker.update(frame(12000), scan(95, 400, 0.98, 'poison'))[0]).toMatchObject({
      card: 'poison',
      evidence: 'spell_effect_visible',
    });
  });
});

describe('Counterpush result', () => {
  it('uses visible crown totals and rejects malformed or out-of-range labels', () => {
    expect(parseBrowserResult('Crowns: you 0, the opponent 3')).toMatchObject({
      blue: 0,
      red: 3,
      outcome: 'loss',
    });
    expect(parseBrowserResult('Crowns: you 2, the opponent 1')?.outcome).toBe('win');
    expect(parseBrowserResult('Crowns: you 0, the opponent 0')?.outcome).toBe('draw');
    expect(parseBrowserResult('Crowns: you 0, the opponent 2, overtime')?.outcome).toBe('loss');
    expect(parseBrowserResult('Crowns: you 2, the opponent 2, still playing')).toBeNull();
    expect(parseBrowserResult('Crowns: you 4, the opponent 0')).toBeNull();
    expect(parseBrowserResult('You won')).toBeNull();
  });
});
