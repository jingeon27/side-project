import { expect, it } from 'vitest';

import { TowerHealthTracker } from './tower-health.ts';

it('confirms repeated HP readings and records each observed drop once', () => {
  const tracker = new TowerHealthTracker();
  const read = (hp: number, at: number) => tracker.observe([{ tower: 'left', hp, confidence: 1 }], at)[0];
  expect(read(4858, 1000)?.hp).toBeNull();
  expect(read(4858, 1500)?.hp).toBe(4858);
  expect(read(4700, 2000)?.hp).toBeNull();
  expect(read(4700, 2500)).toMatchObject({ hp: 4700, observedDamage: 158 });
  expect(read(4700, 3000)?.observedDamage).toBe(158);
  read(8586, 3500);
  expect(read(8586, 4000)).toMatchObject({ hp: null, observedDamage: 158 });
});

it('does not reuse stale, duplicate, obscured or weak OCR readings as current HP', () => {
  const tracker = new TowerHealthTracker();
  const reading = { tower: 'right' as const, hp: 3000, confidence: 1 };
  tracker.observe([reading], 1000);
  expect(tracker.observe([reading], 3000)[1]?.hp).toBeNull();
  expect(tracker.observe([reading], 3000)[1]?.hp).toBeNull();
  expect(tracker.observe([reading], 3400)[1]?.hp).toBe(3000);
  expect(tracker.observe([], 3800)[1]?.hp).toBeNull();
  expect(tracker.observe([{ ...reading, hp: 0 }], 4000)[1]?.hp).toBeNull();
  expect(tracker.observe([{ ...reading, confidence: 0.5 }], 4400)[1]?.hp).toBeNull();
  expect(tracker.observe([reading, reading], 4800)[1]?.hp).toBeNull();
});
