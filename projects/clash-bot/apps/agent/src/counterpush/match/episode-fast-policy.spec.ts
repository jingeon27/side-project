import { describe, expect, it } from 'vitest';

import { CARD_CATALOGUE } from '../../core/card-catalogue.ts';
import { ACTION_SIZE, FAST_POLICY, STATE_SIZE } from '../../core/fast/features.ts';
import { FastPolicy, type FastWeights } from '../../core/fast/policy.ts';
import { fastController } from './controllers.ts';
import { episodeHarness, START } from './episode.fixture.ts';

const { play } = episodeHarness();

// 빠른 정책이 기사 카드만 강하게 고르도록 직접 만든 가중치다. 판단은 Qwen 없이 이 프로세스에서 한다.
// 카드는 카탈로그 특징으로 들어온다. 손패에서 공중을 못 치고 한 마리만 나오는 유닛은 기사뿐이다.
function knightPolicy() {
  const column = (feature: string) => 9 + CARD_CATALOGUE.cardFeatures.indexOf(feature);
  const zeros = (size: number) => new Float64Array(size);
  const weights: FastWeights = {
    'action.bias': zeros(FAST_POLICY.attention),
    'action.weight': zeros(FAST_POLICY.attention * ACTION_SIZE),
    'encoder.bias': zeros(FAST_POLICY.hidden),
    'encoder.weight': zeros(FAST_POLICY.hidden * STATE_SIZE),
    'query.bias': zeros(FAST_POLICY.attention),
    'query.weight': zeros(FAST_POLICY.attention * FAST_POLICY.hidden),
    'value.bias': zeros(1),
    'value.weight': zeros(FAST_POLICY.hidden),
  };
  weights['query.bias'][0] = 1;
  weights['action.weight'][column('troop')] = 10;
  weights['action.weight'][column('airTargets')] = -10;
  weights['action.weight'][column('count')] = -20;
  return new FastPolicy(weights, 7);
}

describe('the fast policy controller', () => {
  it('decides locally within the deadline and confirms its card input', { timeout: 30_000 }, async () => {
    const { fake, outcome, types, events } = await play(
      {
        controllerVersion: 3,
        screens: {
          start: { hand: START, elixir: 7 },
          after: { hand: ['goblin_hut', 'furnace', 'poison', 'skeletons'], elixir: 4 },
        },
        decisions: [],
        afterPlay: { 1: 'after' },
        end: { inputs: 1, captures: 1 },
      },
      fastController(knightPolicy()),
    );
    expect(fake.match.requests).toEqual([]);
    expect(types).toEqual(['match_start', 'prediction', 'input_sent', 'input_check', 'result']);
    expect(events[0]).toMatchObject({ controllerVersion: 4 });
    const prediction = events[1]!;
    expect(prediction.elapsedMs).toBeLessThan(100);
    expect(prediction.behavior).toMatchObject({ policy: 'fast', version: 7 });
    expect(events[2]!.action).toMatchObject({ card: 'knight' });
    expect(events[3]).toMatchObject({ confirmed: true, spent: 3 });
    expect(outcome).toMatchObject({ result: 'loss', actions: 1, confirmed: 1, learningEligible: true });
  });
});
