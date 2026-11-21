import { z } from 'zod';

import {
  TROPHY_LEARNING,
  trophyPlanSchema,
  trophyResultSchema,
  trophySnapshotSchema,
  type TrophySnapshot,
} from './protocol.ts';

// 봉인한 한 경기: 계획, 확인한 결과와 trajectory.json의 SHA-256이다.
const completedSchema = trophyPlanSchema.extend({
  result: trophyResultSchema,
  episodeSHA256: z.string().length(64),
});
export type Completed = z.infer<typeof completedSchema>;
export const orderSchema = z
  .tuple([z.enum(['baseline', 'candidate']), z.enum(['baseline', 'candidate'])])
  .refine((row) => row[0] !== row[1]);
export const trialSchema = z.strictObject({
  id: z.uuid(),
  alpha: z.number().positive(),
  attempt: z.int().nonnegative(),
  pairs: z.int().positive(),
  order: z.array(orderSchema),
  baseline: trophySnapshotSchema,
  candidate: trophySnapshotSchema,
  games: z.array(completedSchema),
});
export type Trial = z.infer<typeof trialSchema>;
// 시뮬레이터 챔피언 평가 기록이다. tried는 한 번 비교한 가중치, parked는 그동안 보관한 PPO 후보다.
const simulationSchema = z.strictObject({
  tried: z.array(z.string().length(64)),
  current: z
    .strictObject({
      league: z.string(),
      version: z.int().nonnegative(),
      weightsSHA256: z.string().length(64),
    })
    .nullable(),
  parked: trophySnapshotSchema.nullable(),
});
// state.json: 한 실험(행동 지문)의 학습·평가·채택 진행이다.
export const stateSchema = z.strictObject({
  format: z.literal('trophy-own-policy-learning-v1'),
  behaviorSHA256: z.string().length(64),
  champion: trophySnapshotSchema,
  candidate: trophySnapshotSchema,
  phase: z.enum(['training', 'learning', 'evaluating']),
  pending: trophyPlanSchema.nullable(),
  batch: z.array(completedSchema),
  trial: trialSchema.nullable(),
  processed: z.array(z.string()),
  trainingGames: z.int().nonnegative(),
  evaluationGames: z.int().nonnegative(),
  updates: z.int().nonnegative(),
  promotions: z.int().nonnegative(),
  excluded: z.int().nonnegative(),
  consecutiveExcluded: z.int().nonnegative(),
  lastUpdate: z.record(z.string(), z.unknown()).nullable(),
  lastEvaluation: z.record(z.string(), z.unknown()).nullable(),
  simulation: simulationSchema,
});
export type State = z.infer<typeof stateSchema>;

export const initialState = (behaviorSHA256: string, seed: TrophySnapshot): State => ({
  format: TROPHY_LEARNING.format,
  behaviorSHA256,
  champion: seed,
  candidate: seed,
  phase: 'training',
  pending: null,
  batch: [],
  trial: null,
  processed: [],
  trainingGames: 0,
  evaluationGames: 0,
  updates: 0,
  promotions: 0,
  excluded: 0,
  consecutiveExcluded: 0,
  lastUpdate: null,
  lastEvaluation: null,
  simulation: { tried: [], current: null, parked: null },
});

// 쌍마다 후보 승리와 기준 승리의 차이를 0, 0.5, 1로 센다. 무승부는 승리가 아니다.
export const scoresOf = (trial: Trial) =>
  Array.from({ length: Math.floor(trial.games.length / 2) }, (_, i) => {
    const pair = trial.games.slice(i * 2, i * 2 + 2);
    const candidate = pair.find((row) => row.role === 'candidate'),
      baseline = pair.find((row) => row.role === 'baseline');
    if (!candidate || !baseline) throw new Error('평가 쌍의 역할이 다릅니다.');
    return 0.5 + (Number(candidate.result.outcome === 'win') - Number(baseline.result.outcome === 'win')) / 2;
  });
