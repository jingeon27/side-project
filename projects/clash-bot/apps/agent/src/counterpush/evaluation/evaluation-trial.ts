import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { z } from 'zod';

import type { Profile } from '../../core/profile.ts';
import type { LearningClient } from '../../qwen/learning-client.ts';
import { atomicWrite } from '../../shared/assets.ts';
import { readJsonFile, readOptionalJsonFile } from '../../shared/json-file.ts';
import { attemptAlpha, requiredEvaluationPairs } from '../../shared/qualification.ts';
import type { CounterpushBrowser } from '../browser/browser.ts';
import { controllerFor } from '../match/controllers.ts';
import { playCounterpushEpisode } from '../match/episode.ts';
import type { CounterpushVisionClient } from '../perception/vision-client.ts';
import { behaviorIdentity } from './behavior-identity.ts';
import { EVALUATION_METHOD, frozenComparison, retryInputRecovery } from './evaluation.ts';

// 학습기 status와 후보 체크포인트 metadata.json에서 평가가 쓰는 필드다.
const policyStatusSchema = z.looseObject({
  role: z.string(),
  weights_sha256: z.string().length(64),
  checkpoint: z.string(),
});
export const candidateMetadataSchema = z.looseObject({
  weights_sha256: z.string().length(64),
  candidate_parent_sha256: z.string().length(64).optional(),
  study_parent: z.string().length(64).optional(),
});
const evaluatedGameSchema = z.looseObject({
  result: z.enum(['win', 'loss', 'draw']),
  directory: z.string(),
  actions: z.int().nonnegative(),
  confirmed: z.int().nonnegative(),
  weightsSHA256: z.string().length(64),
  checkpoint: z.string(),
  variant: z.enum(['baseline', 'candidate']),
  pair: z.int().nonnegative(),
  score: z.union([z.literal(0), z.literal(1)]),
});
// counterpush/control/evaluations/*.json은 시작·진행·완료 보고서가 같은 파일이다.
// 재개에 쓰는 필드만 여기서 검사하고, 보고서 필드는 Python 게시 검사가 확인한다.
const trialSchema = z.looseObject({
  behaviorSHA256: z.string().regex(/^[a-f0-9]{64}$/),
  trialID: z.uuid(),
  requestedPairs: z.int().positive(),
  minimumPairs: z.int().positive(),
  method: z.literal(EVALUATION_METHOD),
  futilityStopping: z.boolean(),
  alphaSpendingAttempt: z.int().nonnegative(),
  alpha: z.number().positive(),
  baseline: policyStatusSchema,
  candidate: candidateMetadataSchema,
  games: z.array(evaluatedGameSchema),
});
type Trial = z.infer<typeof trialSchema>;
// counterpush/control/evaluation-attempts.json은 유의수준 예산을 정하는 누적 장부다. 지난 시도 항목은 Python 게시 검사만 읽는다.
const attemptsSchema = z.strictObject({
  count: z.int().nonnegative(),
  trials: z.record(z.string(), z.unknown()),
});

export async function evaluateWithResources(options: {
  dataDir: string;
  behaviorSHA256: string;
  profile: Profile;
  candidate: string;
  pairs: number;
  file: string;
  client: LearningClient;
  vision: CounterpushVisionClient;
  browser: CounterpushBrowser;
  signal: AbortSignal;
  stopped: () => Promise<boolean>;
  report: (state: Record<string, unknown>) => Promise<void>;
  onGame?: () => void;
  rejectFutile?: boolean;
}) {
  const { dataDir, client } = options;
  const baseline = policyStatusSchema.parse(await client.status());
  if (baseline.role !== 'champion') throw new Error('기준 모델로 복귀한 뒤 평가해야 합니다.');
  const candidate = await readJsonFile(join(options.candidate, 'metadata.json'), candidateMetadataSchema);
  if (
    (candidate.candidate_parent_sha256 ?? candidate.study_parent) !== baseline.weights_sha256 ||
    candidate.weights_sha256 === baseline.weights_sha256
  )
    throw new Error('후보가 현재 기준 모델에서 만들어지지 않았거나 가중치가 같습니다.');
  const previous = await readOptionalJsonFile(options.file, trialSchema);
  const behaviorSHA256 = options.behaviorSHA256;
  if ((await behaviorIdentity(options.profile)) !== behaviorSHA256)
    throw new Error('실행 시작 뒤 코드나 계약이 바뀌어 새 프로세스에서 평가해야 합니다.');
  const trial =
    previous ??
    (await (async (): Promise<Trial> => {
      const path = join(dataDir, 'counterpush/control/evaluation-attempts.json');
      const attempts = (await readOptionalJsonFile(path, attemptsSchema)) ?? { count: 0, trials: {} };
      const id = randomUUID();
      const index = attempts.count;
      const alpha = attemptAlpha(index);
      const requestedPairs = requiredEvaluationPairs(options.pairs, alpha);
      await atomicWrite(
        path,
        JSON.stringify(
          {
            count: index + 1,
            trials: {
              ...attempts.trials,
              [id]: {
                index,
                file: options.file,
                baselineSHA256: baseline.weights_sha256,
                candidateSHA256: candidate.weights_sha256,
                behaviorSHA256,
                method: EVALUATION_METHOD,
                minimumPairs: options.pairs,
                requestedPairs,
              },
            },
          },
          null,
          2,
        ) + '\n',
      );
      const created = {
        behaviorSHA256,
        trialID: id,
        requestedPairs,
        minimumPairs: options.pairs,
        method: EVALUATION_METHOD,
        futilityStopping: options.rejectFutile ?? false,
        alphaSpendingAttempt: index,
        alpha,
        baseline,
        candidate,
        games: [],
      };
      await atomicWrite(options.file, JSON.stringify({ ...created, complete: false }, null, 2) + '\n');
      return created;
    })());
  if (
    trial.behaviorSHA256 !== behaviorSHA256 ||
    trial.minimumPairs !== options.pairs ||
    trial.baseline.weights_sha256 !== baseline.weights_sha256 ||
    trial.candidate.weights_sha256 !== candidate.weights_sha256
  )
    throw new Error('평가 재개 시 코드·프로필·기준·후보 또는 경기 수가 달라졌습니다.');
  const result = await frozenComparison({
    pairs: trial.requestedPairs,
    alpha: trial.alpha,
    existingGames: trial.games,
    rejectFutile: trial.futilityStopping,
    stopped: options.stopped,
    play: async (variant, pair) => {
      if ((await behaviorIdentity(options.profile)) !== behaviorSHA256)
        throw new Error('평가 도중 실행 코드나 계약이 바뀌었습니다.');
      const checkpoint = variant === 'baseline' ? baseline.checkpoint : options.candidate;
      const selected = await client.checkout(checkpoint);
      await options.report({ phase: 'evaluating', pair: pair + 1, variant, policy: selected });
      try {
        const episode = await retryInputRecovery(
          async () =>
            playCounterpushEpisode({
              ...options,
              controller: await controllerFor(client),
              report: async (state) =>
                options.report({ ...state, phase: 'evaluating', variant, pair: pair + 1 }),
              persistPatterns: false,
            }),
          async (episode) => {
            await atomicWrite(
              join(episode.directory, 'qualification.json'),
              JSON.stringify({ role: 'excluded_input_recovery', trialID: trial.trialID, variant, pair }) +
                '\n',
            );
          },
        );
        const after = await client.status();
        if (selected.weights_sha256 !== after.weights_sha256)
          throw new Error('평가 도중 모델 가중치가 바뀌었습니다.');
        if ((await behaviorIdentity(options.profile)) !== behaviorSHA256)
          throw new Error('평가 도중 실행 코드나 계약이 바뀌었습니다.');
        await atomicWrite(
          join(episode.directory, 'qualification.json'),
          JSON.stringify({
            role: 'heldout_evaluation',
            trialID: trial.trialID,
            variant,
            pair,
            weightsSHA256: selected.weights_sha256,
            behaviorSHA256,
          }) + '\n',
        );
        options.onGame?.();
        return { ...episode, weightsSHA256: String(selected.weights_sha256), checkpoint };
      } finally {
        await client.checkout(null);
      }
    },
    report: async (state) => {
      await atomicWrite(
        options.file,
        JSON.stringify({ ...trial, ...state, complete: false }, null, 2) + '\n',
      );
      await options.report({ ...state, phase: 'evaluating' });
    },
  });
  const final = {
    ...trial,
    ...result,
    repeatedCandidateTestingCorrected: true,
    baselineUnchanged: (await client.status()).weights_sha256 === baseline.weights_sha256,
  };
  await atomicWrite(options.file, JSON.stringify(final, null, 2) + '\n');
  return { ...final, reportPath: options.file };
}
