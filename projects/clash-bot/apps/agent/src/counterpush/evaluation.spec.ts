import { describe, expect, it, vi } from 'vitest';

import { frozenComparison, realEvaluationGate } from './evaluation.ts';

describe('frozen Counterpush comparison', () => {
  it('continues a partially completed pair without replaying its baseline game', async () => {
    const play = vi.fn(async () => ({
      result: 'win',
      directory: '/new-candidate',
      actions: 2,
      confirmed: 2,
    }));
    const result = await frozenComparison({
      pairs: 1,
      play,
      stopped: async () => false,
      report: async () => {},
      existingGames: [
        {
          pair: 0,
          variant: 'baseline',
          result: 'loss',
          score: 0,
          directory: '/old-baseline',
          actions: 2,
          confirmed: 2,
        },
      ],
    });
    expect(play).toHaveBeenCalledExactlyOnceWith('candidate', 0);
    expect(result.games.map((game) => game.directory)).toEqual(['/old-baseline', '/new-candidate']);
    expect(result.pairs).toEqual([1]);
  });
  it('balances play order, scores verified games and refuses a small apparent improvement', async () => {
    const play = vi.fn(async (variant: 'baseline' | 'candidate') => ({
      result: variant === 'candidate' ? 'win' : 'loss',
      directory: '/episode',
      actions: 3,
      confirmed: 3,
    }));
    const result = await frozenComparison({
      pairs: 2,
      play,
      stopped: async () => false,
      report: async () => {},
    });
    expect(play.mock.calls.map(([variant]) => variant)).toEqual([
      'baseline',
      'candidate',
      'candidate',
      'baseline',
    ]);
    expect(result.pairs).toEqual([1, 1]);
    expect(result.gate.passed).toBe(false);
    expect(result.trainingDuringEvaluation).toBe(false);
    expect(result.sameEnvironmentSeed).toBe(false);
    expect(result.promoted).toBe(false);
  });
  it('requires a sufficient heldout advantage and rejects nonfinite, tied or interrupted data', async () => {
    expect(realEvaluationGate(Array.from({ length: 16 }, () => 1)).passed).toBe(true);
    expect(realEvaluationGate(Array.from({ length: 64 }, () => 0.5)).passed).toBe(false);
    expect(realEvaluationGate([NaN]).passed).toBe(false);
    const result = await frozenComparison({
      pairs: 32,
      play: vi.fn(),
      stopped: async () => true,
      report: async () => {},
    });
    expect(result.complete).toBe(false);
    expect(result.gate.reason).toBe('interrupted_evaluation');
    await expect(
      frozenComparison({
        pairs: 1,
        stopped: async () => false,
        report: async () => {},
        play: async () => ({ result: 'unknown', directory: '/episode', actions: 0, confirmed: 0 }),
      }),
    ).rejects.toThrow('승패');
  });
});
