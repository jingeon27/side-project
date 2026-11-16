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
// 진행 중인 목표는 같은 판수일 때만 이어 간다. 완료된 목표는 보관 대상으로 돌려주고 현재 누적 수에서 새 목표를 시작한다.
export function resumeTrainingGoal(
  previous: TrainingGoal | null,
  requested: number,
  state: EvolutionState,
): { goal: TrainingGoal; completed: TrainingGoal | null } {
  if (!previous) return { goal: trainingGoal(requested, state), completed: null };
  if (previous.format !== 'counterpush-training-goal-v1')
    throw new Error('저장된 학습 목표 형식이 다릅니다. 기존 목표 기록을 먼저 확인하세요.');
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
          completedAt: goal.completedAt ?? new Date().toISOString(),
          evaluationReport: state.lastDecision?.report,
        }
      : {}),
  };
}
