import { expect, it } from 'vitest';

import type { EvolutionState } from './qualified-loop.ts';
import { goalProgress, trainingGoal } from './training-goal.ts';

it('counts completed learned games rather than evaluation games and finishes only after candidate assessment', () => {
  const state = { trainingEpisodes: 9, comparisons: 2, phase: 'candidate_training' } as EvolutionState;
  const goal = trainingGoal(100, state);
  expect(goalProgress(goal, { ...state, comparisons: 20 }).completedTrainingGames).toBe(0);
  expect(goalProgress(goal, { ...state, trainingEpisodes: 109 })).toMatchObject({
    learningComplete: true,
    complete: false,
  });
  const assessed = {
    ...state,
    trainingEpisodes: 109,
    comparisons: 3,
    phase: 'rejected',
    lastDecision: { report: '/frozen-trial' },
  };
  const finished = goalProgress(goal, assessed);
  expect(finished).toMatchObject({
    completedTrainingGames: 100,
    learningComplete: true,
    complete: true,
    evaluationReport: '/frozen-trial',
  });
  expect(
    goalProgress(JSON.parse(JSON.stringify(goal)), { ...state, trainingEpisodes: 34 }).completedTrainingGames,
  ).toBe(25);
  expect(() => trainingGoal(0, state)).toThrow();
});
