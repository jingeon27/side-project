import { describe, expect, it, vi } from 'vitest';

import {
  frozenComparison,
  realEvaluationGate,
  requiredEvaluationPairs,
  retryInputRecovery,
} from './evaluation.ts';

describe('frozen Counterpush comparison', () => {
  it('excludes an input recovery game instead of treating it as assessment evidence', async () => {
    const play = vi
      .fn()
      .mockResolvedValueOnce({ learningEligible: false })
      .mockResolvedValueOnce({ learningEligible: true });
    const excluded = vi.fn(async () => {});
    expect(await retryInputRecovery(play, excluded)).toEqual({ learningEligible: true });
    expect(excluded).toHaveBeenCalledTimes(1);
    await expect(retryInputRecovery(async () => ({ learningEligible: false }), excluded)).rejects.toThrow(
      '3경기',
    );
  });
  it('returns to learning when even winning every remaining pair cannot qualify, without qualifying early', async () => {
    const losing = await frozenComparison({
      pairs: 16,
      alpha: 0.025,
      rejectFutile: true,
      stopped: async () => false,
      report: async () => {},
      play: async (variant, pair) => ({
        directory: `/${variant}-${pair}`,
        result: 'loss',
        actions: 1,
        confirmed: 1,
      }),
    });
    expect(losing.rejectedEarly).toBe(true);
    expect(losing.complete).toBe(false);
    expect(losing.games.length).toBeLessThan(32);
    expect(losing.gate).toMatchObject({ passed: false, reason: 'cannot_qualify_with_remaining_pairs' });
    expect(
      realEvaluationGate([...losing.pairs, ...Array(16 - losing.pairs.length).fill(1)], 0.025).passed,
    ).toBe(false);
    const winning = await frozenComparison({
      pairs: 16,
      alpha: 0.025,
      rejectFutile: true,
      stopped: async () => false,
      report: async () => {},
      play: async (variant, pair) => ({
        directory: `/${variant}-${pair}`,
        result: variant === 'candidate' ? 'win' : 'loss',
        actions: 1,
        confirmed: 1,
      }),
    });
    expect(winning.complete).toBe(true);
    expect(winning.games).toHaveLength(32);
    expect(winning.gate.passed).toBe(true);
  });
  it('uses the exact discordant-win test and keeps late evaluations capable of qualifying', () => {
    expect(realEvaluationGate([...Array(6).fill(1), ...Array(10).fill(0.5)], 0.025)).toMatchObject({
      passed: true,
      oneSidedP: 1 / 64,
    });
    expect(realEvaluationGate([...Array(5).fill(1), ...Array(11).fill(0.5)], 0.025).passed).toBe(false);
    const alpha = 0.05 / (100001 * 100002);
    for (const method of ['paired_exact_wins_v1', 'hoeffding_score'] as const) {
      const count = requiredEvaluationPairs(16, alpha, method);
      expect(count).toBeGreaterThan(16);
      expect(realEvaluationGate(Array(16).fill(1), alpha, method).passed).toBe(false);
      expect(realEvaluationGate(Array(count).fill(1), alpha, method).passed).toBe(true);
    }
  });
  it('does not count draws as wins in new trials and preserves an old trial method on resume', async () => {
    const newTrial = await frozenComparison({
      pairs: 16,
      stopped: async () => false,
      report: async () => {},
      play: async (variant, pair) => ({
        directory: `/${variant}-${pair}`,
        result: variant === 'candidate' ? 'draw' : 'loss',
        actions: 1,
        confirmed: 1,
      }),
    });
    expect(newTrial.pairs).toEqual(Array(16).fill(0.5));
    expect(newTrial.gate.passed).toBe(false);
    const oldTrial = await frozenComparison({
      pairs: 1,
      method: 'hoeffding_score',
      stopped: async () => false,
      report: async () => {},
      existingGames: [
        {
          pair: 0,
          variant: 'baseline',
          result: 'draw',
          score: 0.5,
          directory: '/old',
          actions: 1,
          confirmed: 1,
        },
      ],
      play: async () => ({ directory: '/new', result: 'win', actions: 1, confirmed: 1 }),
    });
    expect(oldTrial.pairs).toEqual([0.75]);
    expect(oldTrial.method).toBe('hoeffding_score');
  });
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
