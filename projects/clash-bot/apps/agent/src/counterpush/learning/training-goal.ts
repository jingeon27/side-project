import type { EvolutionState } from './qualified-loop.ts';

export type TrainingGoal = {
  format: 'counterpush-training-goal-v1';
  requestedTrainingGames: number;
  startTrainingEpisodes: number;
  startComparisons: number;
  createdAt: string;
  completedTrainingGames: number;
  learningComplete: boolean;
  complete: boolean;
  evaluationReport?: unknown;
  completedAt?: string;
};
export const trainingGoal = (count: number, state: EvolutionState): TrainingGoal => {
  if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('학습 목표는 1~10000판입니다.');
  return {
    format: 'counterpush-training-goal-v1',
    requestedTrainingGames: count,
    startTrainingEpisodes: state.trainingEpisodes,
    startComparisons: state.comparisons,
    createdAt: new Date().toISOString(),
    completedTrainingGames: 0,
    learningComplete: false,
    complete: false,
  };
};
export function goalProgress(goal: TrainingGoal, state: EvolutionState): TrainingGoal {
  const completedTrainingGames = Math.max(0, state.trainingEpisodes - goal.startTrainingEpisodes);
  const learningComplete = completedTrainingGames >= goal.requestedTrainingGames;
  const complete =
    goal.complete ||
    (learningComplete &&
      state.comparisons > goal.startComparisons &&
      ['promoted', 'rejected'].includes(state.phase));
  return {
    ...goal,
    completedTrainingGames,
    learningComplete,
    complete,
    ...(complete
      ? {
          completedAt: goal.completedAt ?? new Date().toISOString(),
          evaluationReport: state.lastDecision?.report,
        }
      : {}),
  };
}
