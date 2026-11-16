import { describe, expect, it } from 'vitest';

import { SpawnPatterns, type SpawnCast } from './spawn-patterns.ts';

const cast = (id: string): SpawnCast => ({
  id,
  side: 'red',
  observedMs: 8500,
  samples: [
    { afterMs: 1000, dx: -0.5, dy: 0.5, confidence: 0.98 },
    { afterMs: 2000, dx: 0.5, dy: -0.5, confidence: 0.98 },
    { afterMs: 3000, dx: -0.5, dy: -0.5, confidence: 0.98 },
  ],
});

describe('observed Graveyard spawn patterns', () => {
  it('requires three different completed casts, translates relative offsets and does not mix actor orientation', () => {
    const patterns = new SpawnPatterns();
    const effect = { side: 'red' as const, x: 273, y: 406, radius: 60, visibleAgeMs: 1500 };
    patterns.add(cast('one'));
    patterns.add(cast('one'));
    patterns.add(cast('two'));
    expect(patterns.predict(effect)).toEqual([]);
    patterns.add(cast('three'));
    expect(patterns.predict(effect)[0]).toMatchObject({
      x: 303,
      y: 376,
      inMs: 500,
      supportingCasts: 3,
      source: 'empirical_first_visibility',
    });
    expect(patterns.predict({ ...effect, side: 'blue' })).toEqual([]);
  });
  it('rejects short visibility and overlapping casts as a basis for fixed-timing predictions', () => {
    const patterns = new SpawnPatterns();
    patterns.add({ ...cast('short'), observedMs: 1000 });
    patterns.add({ ...cast('overlap'), observedMs: 16000 });
    expect(patterns.casts).toHaveLength(0);
  });
});
