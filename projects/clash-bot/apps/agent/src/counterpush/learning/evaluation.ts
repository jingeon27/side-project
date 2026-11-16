import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { LearningClient } from '../../qwen/learning-client.ts';
import { selectModel, type ModelId } from '../../qwen/model-options.ts';
import { atomicWrite } from '../../shared/assets.ts';
import type { Profile } from '../../shared/config.ts';
import { attemptAlpha, QUALIFICATION } from '../../shared/qualification.ts';
import { acquireLearningLock } from '../../shared/runtime-lock.ts';
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
export type EvaluationMethod = 'paired_exact_wins_v1' | 'hoeffding_score';
const scoreOf = (result: string, method: EvaluationMethod) =>
  result === 'win' ? 1 : result === 'draw' && method === 'hoeffding_score' ? 0.5 : 0;
const orderOf = (pair: number) =>
  pair % 2 ? (['candidate', 'baseline'] as const) : (['baseline', 'candidate'] as const);

export async function retryInputRecovery<T extends { learningEligible?: boolean }>(
  play: () => Promise<T>,
  excluded: (episode: T) => Promise<void>,
) {
  for (const _ of [0, 1, 2]) {
    const episode = await play();
    if (episode.learningEligible !== false) return episode;
    await excluded(episode);
  }
  throw new Error('입력 확인이 3경기 연속 실패해 평가를 중단했습니다.');
}

export function requiredEvaluationPairs(minimum: number, alpha: number, method: EvaluationMethod) {
  if (minimum < QUALIFICATION.minimumPairs) return minimum; // Small manual smoke runs cannot qualify.
  const feasible =
    method === 'paired_exact_wins_v1'
      ? Math.ceil(-Math.log2(alpha)) + 1
      : Math.ceil(2 * Math.log(2 / alpha)) + 1;
  return Math.max(minimum, feasible);
}

export function realEvaluationGate(
  pairScores: number[],
  alpha = QUALIFICATION.familyAlpha,
  method: EvaluationMethod = 'paired_exact_wins_v1',
) {
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
  if (method === 'paired_exact_wins_v1') {
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
  const radius = Math.sqrt(Math.log(2 / alpha) / (2 * pairScores.length));
  const lower = Math.max(0, mean - radius),
    upper = Math.min(1, mean + radius);
  const passed = enough(mean) && lower > 0.5;
  return {
    passed,
    reason: passed ? 'qualified' : 'insufficient_evidence_of_improvement',
    pairs: pairScores.length,
    score: mean,
    confidenceInterval: [lower, upper],
    bound: 'Hoeffding',
    alpha,
  };
}

export async function frozenComparison(options: {
  pairs: number;
  play: (variant: 'baseline' | 'candidate', pair: number) => Promise<Result>;
  stopped: () => Promise<boolean>;
  report: (state: Record<string, unknown>) => Promise<void>;
  alpha?: number;
  method?: EvaluationMethod;
  existingGames?: EvaluatedGame[];
  rejectFutile?: boolean;
}) {
  const games: EvaluatedGame[] = [...(options.existingGames ?? [])];
  const method = options.method ?? 'paired_exact_wins_v1';
  if (games.length > options.pairs * 2 || new Set(games.map((game) => game.directory)).size !== games.length)
    throw new Error('중복되거나 범위를 벗어난 평가 경기입니다.');
  for (const [index, game] of games.entries()) {
    const pair = Math.floor(index / 2);
    if (
      game.pair !== pair ||
      game.variant !== orderOf(pair)[index % 2] ||
      !['win', 'loss', 'draw'].includes(game.result) ||
      game.score !== scoreOf(game.result, method)
    )
      throw new Error('평가 재개 기록의 순서 또는 승패가 맞지 않습니다.');
  }
  const scores: number[] = [];
  const cannotQualify = () =>
    Boolean(options.rejectFutile) &&
    scores.length > 0 &&
    games.length === scores.length * 2 &&
    options.pairs >= QUALIFICATION.minimumPairs &&
    !realEvaluationGate(
      [...scores, ...Array<number>(options.pairs - scores.length).fill(1)],
      options.alpha,
      method,
    ).passed;
  for (const pair of Array.from({ length: options.pairs }, (_, index) => index)) {
    for (const variant of orderOf(pair)) {
      if (games.some((game) => game.pair === pair && game.variant === variant)) continue;
      if (await options.stopped()) break;
      const result = await options.play(variant, pair);
      if (!['win', 'loss', 'draw'].includes(result.result))
        throw new Error('평가 경기의 승패를 확인하지 못했습니다.');
      games.push({ ...result, variant, pair, score: scoreOf(result.result, method) });
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
  const gate = realEvaluationGate(scores, options.alpha, method);
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
    method,
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

type Trial = {
  trialID: string;
  requestedPairs: number;
  alphaSpendingAttempt: number;
  alpha: number;
  baseline: Record<string, unknown>;
  candidate: Record<string, unknown>;
  games: EvaluatedGame[];
  minimumPairs?: number;
  method?: EvaluationMethod;
  futilityStopping?: boolean;
};

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
  const baseline = await client.status();
  if (baseline.role !== 'champion') throw new Error('기준 모델로 복귀한 뒤 평가해야 합니다.');
  const candidate = JSON.parse(await readFile(join(options.candidate, 'metadata.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  if (
    (candidate.candidate_parent_sha256 ?? candidate.study_parent) !== baseline.weights_sha256 ||
    candidate.weights_sha256 === baseline.weights_sha256
  )
    throw new Error('후보가 현재 기준 모델에서 만들어지지 않았거나 가중치가 같습니다.');
  const previous = await readFile(options.file, 'utf8')
    .then((raw) => JSON.parse(raw) as Trial)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
  const trial =
    previous ??
    (await (async (): Promise<Trial> => {
      const path = join(dataDir, 'counterpush/control/evaluation-attempts.json');
      const attempts = await readFile(path, 'utf8')
        .then((raw) => JSON.parse(raw) as { count: number; trials?: Record<string, unknown> })
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return { count: 0, trials: {} };
          throw error;
        });
      if (!Number.isSafeInteger(attempts.count) || attempts.count < 0)
        throw new Error('평가 횟수 기록이 잘못되었습니다.');
      const id = randomUUID();
      const index = attempts.count;
      const alpha = attemptAlpha(index);
      const method: EvaluationMethod = 'paired_exact_wins_v1';
      const requestedPairs = requiredEvaluationPairs(options.pairs, alpha, method);
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
                method,
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
        method,
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
    (trial.minimumPairs ?? trial.requestedPairs) !== options.pairs ||
    trial.baseline.weights_sha256 !== baseline.weights_sha256 ||
    trial.candidate.weights_sha256 !== candidate.weights_sha256
  )
    throw new Error('평가 재개 시 기준·후보 또는 경기 수가 달라졌습니다.');
  const result = await frozenComparison({
    pairs: trial.requestedPairs,
    method: trial.method ?? 'hoeffding_score',
    alpha: trial.alpha,
    existingGames: trial.games,
    rejectFutile: trial.futilityStopping ?? false,
    stopped: options.stopped,
    play: async (variant, pair) => {
      const checkpoint = variant === 'baseline' ? String(baseline.checkpoint) : options.candidate;
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
  model: ModelId;
  candidate: string;
  pairs: number;
  hours: number;
  signal: AbortSignal;
}) {
  const { dataDir, model, signal } = options;
  await readFile(join(options.candidate, 'metadata.json'), 'utf8');
  const lock = await acquireLearningLock(join(dataDir, 'qwen/selfplay'));
  const control = join(dataDir, 'counterpush/control');
  await mkdir(control, { recursive: true, mode: 0o700 });
  const client = new LearningClient(dataDir, model),
    vision = new CounterpushVisionClient(dataDir);
  const resources: { browser: CounterpushBrowser | null } = { browser: null };
  const status = {
    id: lock.owner.id,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    phase: 'evaluation_loading',
    model: selectModel(model, true).name,
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
        const stop = await readFile(join(dataDir, 'qwen/selfplay/stop.json'), 'utf8').catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') return null;
            throw error;
          },
        );
        return stop !== null && (JSON.parse(stop) as { id: string }).id === lock.owner.id;
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
