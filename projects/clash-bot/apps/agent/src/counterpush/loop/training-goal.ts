import dayjs from 'dayjs';
import { z } from 'zod';

import type { EvolutionState } from './qualified-loop.ts';

// counterpush/control/training-goal.json의 현재 형식이다.
export const trainingGoalSchema = z.strictObject({
  format: z.literal('counterpush-training-goal-v1'),
  requestedTrainingGames: z.int().min(1).max(10000),
  startTrainingEpisodes: z.int().nonnegative(),
  startComparisons: z.int().nonnegative(),
  createdAt: z.iso.datetime(),
  completedTrainingGames: z.int().nonnegative(),
  learningComplete: z.boolean(),
  complete: z.boolean(),
  evaluationReport: z.unknown().optional(),
  completedAt: z.iso.datetime().optional(),
});
export type TrainingGoal = z.infer<typeof trainingGoalSchema>;
export const trainingGoal = (count: number, state: EvolutionState): TrainingGoal => {
  if (!Number.isInteger(count) || count < 1 || count > 10000) throw new Error('학습 목표는 1~10000판입니다.');
  return {
    format: 'counterpush-training-goal-v1',
    requestedTrainingGames: count,
    startTrainingEpisodes: state.trainingEpisodes,
    startComparisons: state.comparisons,
    createdAt: dayjs().toISOString(),
    completedTrainingGames: 0,
    learningComplete: false,
    complete: false,
  };
};
// 진행 중인 목표는 같은 판수일 때만 이어 간다. 완료된 목표는 보관 대상으로 돌려주고 현재 누적 수에서 새 목표를 시작한다.
export function resumeTrainingGoal(
  previous: TrainingGoal | null,
  requested: number,
  state: EvolutionState,
): { goal: TrainingGoal; completed: TrainingGoal | null } {
  if (!previous) return { goal: trainingGoal(requested, state), completed: null };
  if (previous.complete) return { goal: trainingGoal(requested, state), completed: previous };
  if (previous.requestedTrainingGames !== requested)
    throw new Error('저장된 학습 목표가 다릅니다. 기존 목표 기록을 먼저 확인하세요.');
  return { goal: previous, completed: null };
}

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
          completedAt: goal.completedAt ?? dayjs().toISOString(),
          evaluationReport: state.lastDecision?.report,
        }
      : {}),
  };
}
