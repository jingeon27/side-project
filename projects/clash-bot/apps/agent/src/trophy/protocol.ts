import { readFileSync } from 'node:fs';

import { z } from 'zod';

import { ACTION_SIZE, STATE_SIZE } from '../core/fast/features.ts';

const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const TROPHY_LEARNING = z
  .strictObject({
    format: z.literal('trophy-own-policy-learning-v1'),
    trainingMatches: z.int().positive(),
    minimumTransitions: z.int().positive(),
    maximumTransitions: z.int().positive(),
    selection: z.strictObject({
      temperature: z.number().min(0.25),
      urgentTemperature: z.number().min(0.25),
      exploration: z.number().gt(0).max(0.1),
    }),
    ppo: z.strictObject({
      epochs: z.int().positive(),
      batchSize: z.int().positive(),
      learningRate: z.number().positive(),
      clipRatio: z.number().positive(),
      entropyWeight: z.number().nonnegative(),
      valueWeight: z.number().nonnegative(),
      gradientNorm: z.number().positive(),
      maximumKL: z.number().positive(),
      backtracks: z.int().positive(),
    }),
  })
  .parse(JSON.parse(readFileSync(new URL('../../contracts/trophy-learning.json', import.meta.url), 'utf8')));

export const trophySnapshotSchema = z.strictObject({
  checkpoint: z.string().min(1),
  version: z.int().nonnegative(),
  weightsSHA256: sha,
});
export type TrophySnapshot = z.infer<typeof trophySnapshotSchema>;
export const trophyResultSchema = z
  .strictObject({
    blue: z.int().min(0).max(3),
    red: z.int().min(0).max(3),
    outcome: z.enum(['win', 'loss', 'draw']),
  })
  .refine(
    (r) => r.outcome === (r.blue > r.red ? 'win' : r.blue < r.red ? 'loss' : 'draw'),
    '승패와 크라운이 다릅니다.',
  );
export type TrophyResult = z.infer<typeof trophyResultSchema>;
export const trophyRoleSchema = z.enum(['training', 'baseline', 'candidate', 'recovery']);
export const trophyPlanSchema = z.strictObject({
  id: z.uuid(),
  role: trophyRoleSchema,
  directory: z.string().min(1),
  policy: trophySnapshotSchema,
  behaviorSHA256: sha,
});
export type TrophyPlan = z.infer<typeof trophyPlanSchema>;
const filename = z.string().regex(/^[a-z0-9_-]+\.png$/);
export const trophyTransitionSchema = z
  .strictObject({
    at: z.number().finite(),
    image: filename,
    imageSHA256: sha,
    features: z.strictObject({ index: z.array(z.int().nonnegative()), value: z.array(z.number().finite()) }),
    actionFeatures: z.array(z.array(z.number().finite()).length(ACTION_SIZE)).min(1).max(26),
    bias: z.array(z.number().finite()),
    temperature: z.number().min(0.25).max(2),
    exploration: z.number().min(0).max(0.1),
    probabilities: z.array(z.number().gt(0).max(1)),
    chosen: z.int().nonnegative(),
    value: z.number().min(-1).max(1),
    confirmation: z.enum(['verified_card_input', 'verified_wait']),
  })
  .superRefine((row, c) => {
    if (
      row.features.index.length !== row.features.value.length ||
      row.features.index.some((v, i) => i > 0 && v <= (row.features.index[i - 1] ?? -1))
    )
      c.addIssue({ code: 'custom', message: '상태 특징의 순서 또는 길이가 다릅니다.' });
    if (row.features.index.some((v) => v >= STATE_SIZE))
      c.addIssue({ code: 'custom', message: '상태 특징이 정책 범위를 벗어났습니다.' });
    if (
      row.actionFeatures.length !== row.bias.length ||
      row.probabilities.length !== row.bias.length ||
      row.chosen >= row.bias.length ||
      Math.abs(row.probabilities.reduce((a, b) => a + b, 0) - 1) > 1e-5
    )
      c.addIssue({ code: 'custom', message: '선택 확률과 후보가 다릅니다.' });
  });
export type TrophyTransition = z.infer<typeof trophyTransitionSchema>;
export const trophyEpisodeSchema = z
  .strictObject({
    format: z.literal('trophy-own-trajectory-v1'),
    id: z.uuid(),
    role: trophyRoleSchema,
    behaviorSHA256: sha,
    policy: trophySnapshotSchema,
    result: trophyResultSchema,
    resultEvidence: z
      .array(z.strictObject({ image: filename, sha256: sha, at: z.number().finite() }))
      .length(2),
    transitions: z.array(trophyTransitionSchema),
    sent: z.int().nonnegative(),
    confirmed: z.int().nonnegative(),
    learningEligible: z.boolean(),
  })
  .superRefine((episode, c) => {
    const first = episode.resultEvidence[0],
      second = episode.resultEvidence[1];
    if (
      !first ||
      !second ||
      first.image === second.image ||
      second.at <= first.at ||
      first.at <= (episode.transitions.at(-1)?.at ?? -Infinity)
    )
      c.addIssue({ code: 'custom', message: '서로 다른 두 결과 관측이 필요합니다.' });
    if (
      episode.confirmed > episode.sent ||
      (episode.learningEligible &&
        (episode.role !== 'training' ||
          episode.sent !== episode.confirmed ||
          episode.transitions.length < TROPHY_LEARNING.minimumTransitions))
    )
      c.addIssue({ code: 'custom', message: '학습할 수 없는 경기입니다.' });
    if (episode.transitions.some((row, i) => i > 0 && row.at <= (episode.transitions[i - 1]?.at ?? Infinity)))
      c.addIssue({ code: 'custom', message: '경기 관측 시간이 역전됐습니다.' });
  });
export type TrophyEpisode = z.infer<typeof trophyEpisodeSchema>;
