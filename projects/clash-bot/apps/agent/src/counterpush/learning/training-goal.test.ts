import { expect, it } from 'vitest';

import type { EvolutionState } from './qualified-loop.ts';
import { goalProgress, resumeTrainingGoal, trainingGoal } from './training-goal.ts';

// 완료된 목표를 그대로 이어 써서, 같은 --training-goal로 다시 실행하면 학습 없이 바로 끝났다.
it('starts a new goal from the current totals when the saved goal is already complete', () => {
  const start = { trainingEpisodes: 5, comparisons: 1, phase: 'candidate_training' } as EvolutionState;
  const now = { ...start, trainingEpisodes: 105, comparisons: 2, phase: 'rejected' } as EvolutionState;
  const done = goalProgress(trainingGoal(100, start), now);
  expect(done.complete).toBe(true);
  for (const requested of [100, 50]) {
    const resumed = resumeTrainingGoal(done, requested, now);
    expect(resumed.completed).toBe(done);
    expect(resumed.goal).toMatchObject({
      requestedTrainingGames: requested,
      startTrainingEpisodes: 105,
      complete: false,
    });
    expect(goalProgress(resumed.goal, now).complete).toBe(false);
  }
});

it('continues an unfinished goal only with the same requested number of games', () => {
  const state = { trainingEpisodes: 5, comparisons: 1, phase: 'candidate_training' } as EvolutionState;
  const running = trainingGoal(100, state);
  expect(resumeTrainingGoal(running, 100, state)).toEqual({ goal: running, completed: null });
  expect(() => resumeTrainingGoal(running, 50, state)).toThrow('저장된 학습 목표가 다릅니다');
});
