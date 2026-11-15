import { describe, expect, it } from 'vitest';

import { DEFAULT_PROFILE } from './config.ts';
import { parsePrediction, validateQwenAction, type FreshBattle } from './qwen-policy.ts';

const prediction = parsePrediction(
  '{"phase":"battle","hand":["knight",null,null,null],"elixir":8,"slot":1,"x":0.4,"y":0.55}',
);
const frame: FreshBattle = { battle: true, elixir: 8, capturedAt: 1000, hand: [[10, 20, 30], [], [], []] };

describe('local Qwen action validation', () => {
  it('accepts an affordable own-side action after rechecking the current hand', () => {
    expect(
      validateQwenAction(prediction, frame, { ...frame, capturedAt: 3000 }, DEFAULT_PROFILE, 3100)?.card,
    ).toBe('knight');
  });
  it('rejects delayed answers, changed cards, unaffordable cards and lobby transitions', () => {
    expect(validateQwenAction(prediction, frame, frame, DEFAULT_PROFILE, 10000)).toBeNull();
    expect(
      validateQwenAction(
        prediction,
        frame,
        { ...frame, hand: [[200, 200, 200], [], [], []] },
        DEFAULT_PROFILE,
        1100,
      ),
    ).toBeNull();
    expect(validateQwenAction(prediction, frame, { ...frame, elixir: 2 }, DEFAULT_PROFILE, 1100)).toBeNull();
    expect(
      validateQwenAction(prediction, frame, { ...frame, battle: false }, DEFAULT_PROFILE, 1100),
    ).toBeNull();
  });
  it('rejects opponent-side units and points outside the arena', () => {
    expect(validateQwenAction({ ...prediction, y: 0.2 }, frame, frame, DEFAULT_PROFILE, 1100)).toBeNull();
    expect(validateQwenAction({ ...prediction, y: 0.95 }, frame, frame, DEFAULT_PROFILE, 1100)).toBeNull();
    expect(
      validateQwenAction({ ...prediction, x: 95 / 368, y: 406 / 652 }, frame, frame, DEFAULT_PROFILE, 1100),
    ).toBeNull();
    expect(
      validateQwenAction({ ...prediction, x: 329 / 368, y: 480 / 652 }, frame, frame, DEFAULT_PROFILE, 1100),
    ).toBeNull();
  });
  it('parses fenced JSON and rejects malformed model outputs', () => {
    expect(parsePrediction('```json\n' + JSON.stringify(prediction) + '\n```').slot).toBe(1);
    expect(() => parsePrediction('play knight')).toThrow();
    expect(() => parsePrediction(JSON.stringify({ ...prediction, slot: 5 }))).toThrow();
  });
});
