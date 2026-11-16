import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { LearningClient } from '../../qwen/learning-client.ts';
import { MODEL } from '../../qwen/model.ts';
import { atomicWrite } from '../../shared/assets.ts';
import type { Profile } from '../../shared/config.ts';
import { readJsonFile, readOptionalJsonFile } from '../../shared/json-file.ts';
import { attemptAlpha, QUALIFICATION } from '../../shared/qualification.ts';
import { acquireLearningLock, stopRequested } from '../../shared/runtime-lock.ts';
import { CounterpushVisionClient } from '../perception/vision-client.ts';
import { CounterpushBrowser } from '../runtime/browser.ts';
import { playCounterpushEpisode } from '../runtime/episode.ts';

type Result = {
  result: string;
  directory: string;
  actions: number;
  confirmed: number;
  weightsSHA256?: string;
  checkpoint?: string;
};
export type EvaluatedGame = Result & { variant: 'baseline' | 'candidate'; pair: number; score: number };
// 평가는 쌍마다 이긴 쪽만 세는 정확 이항 검정 하나다. 무승부는 이긴 판으로 세지 않는다.
const EVALUATION_METHOD = QUALIFICATION.method;
const scoreOf = (result: string) => (result === 'win' ? 1 : 0);
const orderOf = (pair: number) =>
  pair % 2 ? (['candidate', 'baseline'] as const) : (['baseline', 'candidate'] as const);

export async function retryInputRecovery<T extends { learningEligible?: boolean }>(
  play: () => Promise<T>,
  excluded: (episode: T) => Promise<void>,
  attemptsLeft = 3,
): Promise<T> {
  if (attemptsLeft < 1) throw new Error('입력 확인이 3경기 연속 실패해 평가를 중단했습니다.');
  const episode = await play();
  if (episode.learningEligible !== false) return episode;
  await excluded(episode);
  return retryInputRecovery(play, excluded, attemptsLeft - 1);
}

export function requiredEvaluationPairs(minimum: number, alpha: number) {
  if (minimum < QUALIFICATION.minimumPairs) return minimum; // Small manual smoke runs cannot qualify.
  return Math.max(minimum, Math.ceil(-Math.log2(alpha)) + 1);
}

export function realEvaluationGate(pairScores: number[], alpha = QUALIFICATION.familyAlpha) {
  const enough = (mean: number) =>
    pairScores.length >= QUALIFICATION.minimumPairs && mean >= QUALIFICATION.minimumMeanScore;
  if (
    !pairScores.length ||
    !Number.isFinite(alpha) ||
    alpha <= 0 ||
    alpha > QUALIFICATION.familyAlpha ||
    pairScores.some((score) => !Number.isFinite(score) || score < 0 || score > 1)
  )
    return { passed: false, reason: 'invalid_or_missing_pairs' };
  const mean = pairScores.reduce((sum, value) => sum + value, 0) / pairScores.length;
  if (pairScores.some((value) => ![0, 0.5, 1].includes(value)))
    return { passed: false, reason: 'invalid_win_pair_score' };
  const wins = pairScores.filter((value) => value > 0.5).length,
    losses = pairScores.filter((value) => value < 0.5).length;
  const decisive = wins + losses;
  const sum = { combination: 1, tail: 0 };
  for (const count of Array.from({ length: decisive + 1 }, (_, index) => index)) {
    if (count >= wins) sum.tail += sum.combination;
    sum.combination *= (decisive - count) / (count + 1);
  }
  const probability = decisive ? sum.tail / 2 ** decisive : 1;
  const passed = enough(mean) && probability <= alpha;
  return {
    passed,
    reason: passed ? 'qualified' : 'insufficient_evidence_of_improvement',
    pairs: pairScores.length,
    score: mean,
    deltaWinRate: 2 * mean - 1,
    pairWins: wins,
    pairLosses: losses,
    oneSidedP: probability,
    test: 'exact_paired_binomial',
    alpha,
  };
}

export async function frozenComparison(options: {
  pairs: number;
  play: (variant: 'baseline' | 'candidate', pair: number) => Promise<Result>;
  stopped: () => Promise<boolean>;
  report: (state: Record<string, unknown>) => Promise<void>;
  alpha?: number;
  existingGames?: EvaluatedGame[];
  rejectFutile?: boolean;
}) {
  const games: EvaluatedGame[] = [...(options.existingGames ?? [])];
  if (games.length > options.pairs * 2 || new Set(games.map((game) => game.directory)).size !== games.length)
    throw new Error('중복되거나 범위를 벗어난 평가 경기입니다.');
  for (const [index, game] of games.entries()) {
    const pair = Math.floor(index / 2);
    if (
      game.pair !== pair ||
      game.variant !== orderOf(pair)[index % 2] ||
      !['win', 'loss', 'draw'].includes(game.result) ||
      game.score !== scoreOf(game.result)
    )
      throw new Error('평가 재개 기록의 순서 또는 승패가 맞지 않습니다.');
  }
  const scores: number[] = [];
  const cannotQualify = () =>
    Boolean(options.rejectFutile) &&
    scores.length > 0 &&
    games.length === scores.length * 2 &&
    options.pairs >= QUALIFICATION.minimumPairs &&
    !realEvaluationGate([...scores, ...Array<number>(options.pairs - scores.length).fill(1)], options.alpha)
      .passed;
  for (const pair of Array.from({ length: options.pairs }, (_, index) => index)) {
    for (const variant of orderOf(pair)) {
      if (games.some((game) => game.pair === pair && game.variant === variant)) continue;
      if (await options.stopped()) break;
      const result = await options.play(variant, pair);
      if (!['win', 'loss', 'draw'].includes(result.result))
        throw new Error('평가 경기의 승패를 확인하지 못했습니다.');
      games.push({ ...result, variant, pair, score: scoreOf(result.result) });
      await options.report({
        pair: pair + 1,
        variant,
        completed: games.length,
        lastResult: result.result,
        games,
      });
    }
    const block = games.filter((game) => game.pair === pair);
    if (block.length !== 2) break;
    scores.push(
      0.5 +
        (block.find((game) => game.variant === 'candidate')!.score -
          block.find((game) => game.variant === 'baseline')!.score) /
          2,
    );
    // Rejection only: even winning every remaining pair could not pass the
    // original full-sample gate. Never accept early or recycle its alpha.
    if (cannotQualify()) break;
  }
  const complete = scores.length === options.pairs;
  const rejectedEarly = !complete && cannotQualify();
  const gate = realEvaluationGate(scores, options.alpha);
  return {
    format: 'counterpush-frozen-ab-evaluation-v1',
    games,
    pairs: scores,
    complete,
    rejectedEarly,
    sameEnvironmentSeed: false,
    order: 'AB_BA_blocks',
    trainingDuringEvaluation: false,
    selection: 'categorical_as_live',
    method: EVALUATION_METHOD,
    gate: complete
      ? gate
      : {
          ...gate,
          passed: false,
          reason: rejectedEarly ? 'cannot_qualify_with_remaining_pairs' : 'interrupted_evaluation',
        },
    promoted: false,
  };
}

// 학습기 status와 후보 체크포인트 metadata.json에서 평가가 쓰는 필드다.
const policyStatusSchema = z.looseObject({
  role: z.string(),
  weights_sha256: z.string().length(64),
  checkpoint: z.string(),
});
const candidateMetadataSchema = z.looseObject({
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
    trial.minimumPairs !== options.pairs ||
    trial.baseline.weights_sha256 !== baseline.weights_sha256 ||
    trial.candidate.weights_sha256 !== candidate.weights_sha256
  )
    throw new Error('평가 재개 시 기준·후보 또는 경기 수가 달라졌습니다.');
  const result = await frozenComparison({
    pairs: trial.requestedPairs,
    alpha: trial.alpha,
    existingGames: trial.games,
    rejectFutile: trial.futilityStopping,
    stopped: options.stopped,
    play: async (variant, pair) => {
      const checkpoint = variant === 'baseline' ? baseline.checkpoint : options.candidate;
      const selected = await client.checkout(checkpoint);
      await options.report({ phase: 'evaluating', pair: pair + 1, variant, policy: selected });
      try {
        const episode = await retryInputRecovery(
          () =>
            playCounterpushEpisode({
              ...options,
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
        await atomicWrite(
          join(episode.directory, 'qualification.json'),
          JSON.stringify({
            role: 'heldout_evaluation',
            trialID: trial.trialID,
            variant,
            pair,
            weightsSHA256: selected.weights_sha256,
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

export async function runCounterpushEvaluation(options: {
  dataDir: string;
  profile: Profile;
  candidate: string;
  pairs: number;
  hours: number;
  signal: AbortSignal;
}) {
  const { dataDir, signal } = options;
  await readJsonFile(join(options.candidate, 'metadata.json'), candidateMetadataSchema);
  const lock = await acquireLearningLock(join(dataDir, 'qwen/selfplay'));
  const control = join(dataDir, 'counterpush/control');
  await mkdir(control, { recursive: true, mode: 0o700 });
  const client = new LearningClient(dataDir),
    vision = new CounterpushVisionClient(dataDir);
  const resources: { browser: CounterpushBrowser | null } = { browser: null };
  const status = {
    id: lock.owner.id,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    phase: 'evaluation_loading',
    model: MODEL.name,
    completed: 0,
    updates: 0,
    tabs: 1,
    candidate: options.candidate,
  };
  const report = async (update: Record<string, unknown>) => {
    Object.assign(status, update, { updatedAt: new Date().toISOString() });
    await atomicWrite(join(control, 'status.json'), JSON.stringify(status, null, 2) + '\n');
  };
  const abort = () => {
    void client.close();
    void vision.close();
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    await report({ phase: 'evaluation_loading' });
    await client.ready();
    await vision.ready();
    const browser = await CounterpushBrowser.open(dataDir);
    resources.browser = browser;
    const deadline = options.hours ? Date.now() + options.hours * 3_600_000 : Infinity;
    const result = await evaluateWithResources({
      ...options,
      client,
      vision,
      browser,
      file: join(control, 'evaluations', `${status.startedAt.replaceAll(':', '-')}-${randomUUID()}.json`),
      report,
      stopped: async () => {
        if (signal.aborted || Date.now() >= deadline) return true;
        return stopRequested(join(dataDir, 'qwen/selfplay'), lock.owner.id);
      },
    });
    await report({
      phase: 'stopped',
      evaluationFile: result.reportPath,
      gate: result.gate,
      baselineUnchanged: result.baselineUnchanged,
    });
    return result;
  } catch (error) {
    await resources.browser?.screenshot(join(control, 'last-evaluation-error.png')).catch(() => {});
    await report({ phase: signal.aborted ? 'interrupted' : 'failed', error: String(error) });
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    await Promise.all([client.close(), vision.close()]);
    await resources.browser?.close().catch(() => {});
    await lock.release();
  }
}
