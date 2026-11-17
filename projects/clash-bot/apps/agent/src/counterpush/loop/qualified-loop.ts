import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

import { z } from 'zod';

import type { EvaluatedGame } from './evaluation.ts';

// Python 게시 기록은 Path.resolve()로 심볼릭 링크를 푼 경로라서 같은 기준으로 비교한다.
async function canonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return resolve(path);
    throw error;
  }
}

const policySnapshotSchema = z.strictObject({
  version: z.int().nonnegative(),
  weightsSHA256: z.string().length(64),
  directory: z.string(),
  checkpoint: z.string(),
  qualificationReport: z.string().optional(),
});
export type PolicySnapshot = z.infer<typeof policySnapshotSchema>;
// playCounterpushEpisode의 결과 그대로다. 학습 전에 멈추면 pendingEpisode로 저장된다.
const trainingEpisodeSchema = z.strictObject({
  directory: z.string(),
  result: z.string(),
  blue: z.int().min(0).max(3).nullable(),
  red: z.int().min(0).max(3).nullable(),
  actions: z.int().nonnegative(),
  confirmed: z.int().nonnegative(),
  abilityActions: z.int().nonnegative(),
  abilityConfirmed: z.int().nonnegative(),
  seenBattle: z.boolean(),
  opponentActions: z.int().nonnegative(),
  learningEligible: z.boolean(),
});
export type TrainingEpisode = z.infer<typeof trainingEpisodeSchema>;
const EVOLUTION_PHASES = [
  'initializing',
  'preparing_candidate',
  'candidate_training',
  'input_recovery',
  'candidate_learning',
  'candidate_study',
  'training_more',
  'evaluating',
  'evaluation_pending',
  'promoting',
  'promoted',
  'rejected',
] as const;
// counterpush/control/evolution.json의 현재 형식이다. 재개는 evaluationFile·pendingEpisode·trainingGames로 판단한다.
export const evolutionStateSchema = z.strictObject({
  format: z.literal('counterpush-qualified-learning-v1'),
  phase: z.enum(EVOLUTION_PHASES),
  champion: policySnapshotSchema,
  candidateDirectory: z.string().nullable(),
  candidate: policySnapshotSchema.nullable(),
  pendingEpisode: trainingEpisodeSchema.nullable(),
  trainingGames: z.int().nonnegative(),
  trainingEpisodes: z.int().nonnegative(),
  comparisons: z.int().nonnegative(),
  promotions: z.int().nonnegative(),
  evaluationFile: z.string().nullable(),
  lastDecision: z.record(z.string(), z.unknown()).optional(),
  consecutiveInputFailures: z.int().nonnegative().optional(),
});
export type EvolutionState = z.infer<typeof evolutionStateSchema>;
export type Qualification = {
  complete: boolean;
  gate: { passed: boolean; reason: string };
  reportPath: string;
  games: EvaluatedGame[];
};

// Owns the durable phase order. All match/model/file operations are supplied
// by the runner, which owns the single browser, learner and process lock.
export async function qualifiedLearningLoop(options: {
  state: EvolutionState;
  trainingMatches: number;
  stopped: () => Promise<boolean>;
  newCandidateDirectory: () => string;
  newEvaluationFile: () => string;
  begin: (directory: string) => Promise<PolicySnapshot>;
  restore: () => Promise<PolicySnapshot>;
  play: () => Promise<TrainingEpisode>;
  learn: (episode: TrainingEpisode) => Promise<void>;
  study: () => Promise<void>;
  evaluate: (candidate: PolicySnapshot, file: string) => Promise<Qualification>;
  promote: (candidate: PolicySnapshot, report: string) => Promise<PolicySnapshot>;
  save: (state: EvolutionState) => Promise<void>;
}) {
  const state = options.state;
  const persist = async (phase: EvolutionState['phase']) => {
    state.phase = phase;
    await options.save(state);
  };
  const actual = await options.restore();
  const recoveredPublication =
    state.phase === 'promoting' &&
    state.candidate?.weightsSHA256 === actual.weightsSHA256 &&
    actual.qualificationReport !== undefined &&
    state.evaluationFile !== null &&
    (await canonicalPath(actual.qualificationReport)) === (await canonicalPath(state.evaluationFile));
  if (recoveredPublication) {
    // Publication succeeded before a crash, but the loop receipt did not.
    state.promotions++;
    state.comparisons++;
    state.candidate = null;
    state.candidateDirectory = null;
    state.evaluationFile = null;
    state.trainingGames = 0;
    state.phase = 'promoted';
    state.pendingEpisode = null;
    state.lastDecision = { accepted: true, reason: 'recovered_qualified_publication' };
  }
  if (!recoveredPublication && state.champion.weightsSHA256 !== actual.weightsSHA256) {
    state.lastDecision = {
      accepted: false,
      reason: 'champion_changed_restart_candidate',
      staleCandidate: state.candidate,
    };
    state.candidate = null;
    state.candidateDirectory = null;
    state.evaluationFile = null;
    state.trainingGames = 0;
    state.pendingEpisode = null;
  }
  state.champion = actual;
  await options.save(state);
  while (!(await options.stopped())) {
    if (!state.evaluationFile) {
      state.candidateDirectory ??= options.newCandidateDirectory();
      await persist('preparing_candidate');
      state.candidate = await options.begin(state.candidateDirectory);
      await options.save(state);
      while (state.trainingGames < options.trainingMatches || state.pendingEpisode) {
        if (!state.pendingEpisode) {
          if (await options.stopped()) break;
          await persist('candidate_training');
          const episode = await options.play();
          if (!['win', 'loss', 'draw'].includes(episode.result))
            throw new Error('학습 경기의 승패가 확인되지 않았습니다.');
          if (episode.learningEligible === false) {
            state.consecutiveInputFailures = (state.consecutiveInputFailures ?? 0) + 1;
            state.lastDecision = {
              accepted: false,
              reason: 'excluded_input_recovery_episode',
              directory: episode.directory,
            };
            await persist('input_recovery');
            if (state.consecutiveInputFailures >= 3)
              throw new Error('입력 확인이 3경기 연속 실패해 인식과 좌표 확인이 필요합니다.');
            continue;
          }
          state.consecutiveInputFailures = 0;
          state.pendingEpisode = episode;
          await persist('candidate_learning');
        }
        await options.learn(state.pendingEpisode);
        state.pendingEpisode = null;
        state.trainingGames++;
        state.trainingEpisodes++;
        await options.save(state);
      }
      if (state.trainingGames < options.trainingMatches) {
        await options.restore();
        break;
      }
      await persist('candidate_study');
      await options.study();
      // begin reloads only the small private adapter and returns its newest
      // checkpoint after PPO/BC/search learning, never publishing it.
      state.candidate = await options.begin(state.candidateDirectory);
      await options.restore();
      if (state.candidate.weightsSHA256 === state.champion.weightsSHA256) {
        state.trainingGames = 0;
        state.lastDecision = { accepted: false, reason: 'candidate_weights_unchanged' };
        await persist('training_more');
        continue;
      }
      state.evaluationFile = options.newEvaluationFile();
      await persist('evaluating');
    }
    if (await options.stopped()) break;
    if (!state.candidate) throw new Error('평가 후보 체크포인트가 없습니다.');
    const evaluation = await options.evaluate(state.candidate, state.evaluationFile);
    if (!evaluation.complete) {
      await persist('evaluation_pending');
      break;
    }
    if (evaluation.gate.passed) {
      await persist('promoting');
      state.champion = await options.promote(state.candidate, evaluation.reportPath);
      state.promotions++;
      state.candidate = null;
      state.candidateDirectory = null;
    }
    state.comparisons++;
    state.lastDecision = {
      accepted: evaluation.gate.passed,
      gate: evaluation.gate,
      report: evaluation.reportPath,
    };
    state.evaluationFile = null;
    state.trainingGames = 0;
    await persist(evaluation.gate.passed ? 'promoted' : 'rejected');
  }
  await options.restore();
  return state;
}
